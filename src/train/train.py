import os
import pandas as pd
import numpy as np
from sklearn.metrics import precision_recall_fscore_support, average_precision_score

import torch
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
)

MODEL_NAME = "vinai/phobert-base"
TRAIN_CSV = "data/datasets/stage1_train.csv"
VAL_CSV   = "data/datasets/stage1_val.csv"
OUT_DIR   = "data/outputs/checkpoints/stage1_risk_any"

MAX_LEN = 256


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    logits = np.asarray(logits).reshape(-1)
    labels = np.asarray(labels).reshape(-1)

    probs = 1 / (1 + np.exp(-logits))
    preds = (probs >= 0.5).astype(int)

    p, r, f1, _ = precision_recall_fscore_support(
        labels, preds, average="binary", zero_division=0
    )
    try:
        auc_pr = float(average_precision_score(labels, probs))
    except Exception:
        auc_pr = 0.0
    return {"precision": float(p), "recall": float(r), "f1": float(f1), "auc_pr": float(auc_pr)}


def make_training_args():
    """
    Compatibility layer for older transformers.
    Some old versions don't accept `evaluation_strategy`.
    We'll try multiple signatures and fall back to train-only if needed.
    """
    common = dict(
        output_dir=OUT_DIR,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=32,
        learning_rate=2e-5,
        num_train_epochs=3,
        weight_decay=0.01,
        logging_steps=50,
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        fp16=torch.cuda.is_available(),
        report_to=[],
    )

    # Newer transformers
    try:
        return TrainingArguments(
            **common,
            evaluation_strategy="epoch",
            save_strategy="epoch",
        )
    except TypeError:
        pass

    # Some versions use `eval_strategy`
    try:
        return TrainingArguments(
            **common,
            eval_strategy="epoch",
            save_strategy="epoch",
        )
    except TypeError:
        pass

    # Oldest fallback: no eval strategy arg -> still train & save
    # We'll remove best-model features if they break.
    try:
        return TrainingArguments(
            **{k: v for k, v in common.items() if k not in ["load_best_model_at_end", "metric_for_best_model", "greater_is_better"]},
            save_strategy="epoch",
        )
    except TypeError:
        # absolute fallback
        return TrainingArguments(
            output_dir=OUT_DIR,
            per_device_train_batch_size=16,
            learning_rate=2e-5,
            num_train_epochs=3,
            logging_steps=50,
            fp16=torch.cuda.is_available(),
            report_to=[],
        )


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    train_df = pd.read_csv(TRAIN_CSV)
    val_df   = pd.read_csv(VAL_CSV)

    # class imbalance -> pos_weight
    pos = max(1, int(train_df["label"].sum()))
    neg = max(1, int((train_df["label"] == 0).sum()))
    pos_weight = torch.tensor([neg / pos], dtype=torch.float)

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, use_fast=False)

    def tok(batch):
        return tokenizer(
            batch["input_text"],
            truncation=True,
            max_length=MAX_LEN,
            padding="max_length",
        )

    train_ds = Dataset.from_pandas(train_df).map(tok, batched=True)
    val_ds   = Dataset.from_pandas(val_df).map(tok, batched=True)

    train_ds = train_ds.rename_column("label", "labels")
    val_ds   = val_ds.rename_column("label", "labels")

    train_ds.set_format(type="torch", columns=["input_ids", "attention_mask", "labels"])
    val_ds.set_format(type="torch", columns=["input_ids", "attention_mask", "labels"])

    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=1)

    class WeightedBCETrainer(Trainer):
        def compute_loss(self, model, inputs, return_outputs=False):
            labels = inputs.pop("labels").float().view(-1, 1)
            outputs = model(**inputs)
            logits = outputs.logits
            loss_fct = torch.nn.BCEWithLogitsLoss(pos_weight=pos_weight.to(logits.device))
            loss = loss_fct(logits, labels)
            return (loss, outputs) if return_outputs else loss

    args = make_training_args()

    # if args doesn't support evaluation at all, passing eval_dataset is still OK usually.
    trainer = WeightedBCETrainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
        compute_metrics=compute_metrics,
    )

    trainer.train()
    trainer.save_model(OUT_DIR)
    tokenizer.save_pretrained(OUT_DIR)

    print("Saved model to:", OUT_DIR)


if __name__ == "__main__":
    main()
