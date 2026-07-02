import os, sys, json
import pandas as pd
import torch
from tqdm import tqdm
from transformers import AutoTokenizer, AutoModelForSequenceClassification

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

MODEL_DIR = "data/outputs/checkpoints/stage1_risk_any"
CLEAN_JSONL = "data/clean/articles_clean.jsonl"
OUT_PRED = "data/outputs/predictions.jsonl"
MAX_LEN = 256

def iter_jsonl(path):
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)

def main():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    tok = AutoTokenizer.from_pretrained(MODEL_DIR, use_fast=False)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR).to(device)
    model.eval()

    os.makedirs("data/outputs", exist_ok=True)
    out = open(OUT_PRED, "w", encoding="utf-8")

    with torch.no_grad():
        for r in tqdm(iter_jsonl(CLEAN_JSONL), desc="Infer"):
            text = ((r.get("title") or "") + "\n\n" + (r.get("text") or "")).strip()
            if not text:
                continue
            enc = tok(text, truncation=True, max_length=MAX_LEN, padding="max_length", return_tensors="pt")
            enc = {k: v.to(device) for k, v in enc.items()}
            logits = model(**enc).logits.view(-1).float()
            prob = torch.sigmoid(logits)[0].item()

            out.write(json.dumps({"id": r["id"], "p_risk_any": prob}, ensure_ascii=False) + "\n")

    out.close()
    print("Wrote:", OUT_PRED)

if __name__ == "__main__":
    main()
