import { useState } from "react";
import { apiPost } from "../api";

export function RegisterScreen({ onRegister, onBack, onGoToLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");

    if (password !== confirmPassword) {
      setErr("Mật khẩu xác nhận không khớp!");
      return;
    }
    if (!email.trim() || !password.trim()) {
      setErr("Vui lòng điền đủ thông tin.");
      return;
    }

    setLoading(true);
    try {
      const data = await apiPost("/api/auth/register", { email: email.trim(), password });
      // Đăng ký xong tự động login luôn cho tiện
      onRegister({ email: data.user.email, token: data.token });
    } catch (e) {
      setErr(e.message || "Đăng ký thất bại.");
    } finally {
      setLoading(false);
    }
  }

  // CSS dùng chung form với Login, nhưng cập nhật background thiên nhiên + gradient mờ
  const scopedCSS = `
    .register-container {
      font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      width: 100vw;
      box-sizing: border-box;

      /* BACKGROUND THIÊN NHIÊN + ĐỘ MỜ TỪ TRÊN (60%) XUỐNG DƯỚI (80%) */
      background: linear-gradient(
          to bottom,
          rgba(0, 0, 0, 0.6),
          rgba(0, 0, 0, 0.8)
        ),
        url('https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1920&auto=format&fit=crop') no-repeat center center / cover;

      position: relative;
    }
    .register-container .back-btn {
      position: absolute;
      left: 20px;
      top: 20px;
      padding: 11px 13px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.3);
      background: rgba(0,0,0,0.3);
      color: #ffffff;
      cursor: pointer;
      font-size: 13px;
      z-index: 10;
      transition: 0.3s;
    }
    .register-container .back-btn:hover {
      background: rgba(255,255,255,0.1);
    }
    .register-container .form-box {
      position: relative;
      width: 400px;
      height: 520px; /* Chỉnh cao hơn Login một chút để chứa 3 input */
      background: transparent;
      border: 2px solid rgba(255,255,255,0.5);
      border-radius: 20px;
      backdrop-filter: blur(15px);
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .register-container h2 {
      font-size: 2em;
      color: #fff;
      text-align: center;
      margin-bottom: 20px;
    }
    .register-container .inputbox {
      position: relative;
      margin: 30px 0;
      width: 310px;
      border-bottom: 2px solid #fff;
    }
    .register-container .inputbox label {
      position: absolute;
      top: 50%;
      left: 5px;
      transform: translateY(-50%);
      color: #fff;
      font-size: 1em;
      pointer-events: none;
      transition: .5s;
    }
    .register-container .inputbox input:focus ~ label,
    .register-container .inputbox input:valid ~ label {
      top: -5px;
    }
    .register-container .inputbox input {
      width: 100%;
      height: 50px;
      background: transparent;
      border: none;
      outline: none;
      font-size: 1em;
      padding: 0 35px 0 5px;
      color: #fff;
    }
    .register-container .inputbox ion-icon {
      position: absolute;
      right: 8px;
      color: #fff;
      font-size: 1.2em;
      top: 20px;
    }
    .register-container .btn-login {
      width: 100%;
      height: 40px;
      border-radius: 40px;
      background: #fff;
      color: #000;
      border: none;
      outline: none;
      cursor: pointer;
      font-size: 1em;
      font-weight: 600;
      margin-top: 10px;
    }
    .register-container .register {
      font-size: .9em;
      color: #fff;
      text-align: center;
      margin: 25px 0 10px;
    }
    .register-container .register p a {
      text-decoration: none;
      color: #fff;
      font-weight: 600;
    }
    .register-container .register p a:hover {
      text-decoration: underline;
    }
    .register-container .error-msg {
      background: rgba(239,68,68,0.2);
      border: 1px solid rgba(239,68,68,0.5);
      color: #ffffff;
      padding: 10px;
      border-radius: 10px;
      font-size: 12px;
      text-align: center;
      margin-bottom: 15px;
    }
  `;

  return (
    <div className="register-container">
      <style>{scopedCSS}</style>

      {onBack && (
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
      )}

      <div className="form-box">
        <div className="form-value">
          <form onSubmit={handleSubmit}>
            <h2>Register</h2>

            <div className="inputbox">
              <ion-icon name="mail-outline"></ion-icon>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label>Email</label>
            </div>

            <div className="inputbox">
              <ion-icon name="lock-closed-outline"></ion-icon>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <label>Password</label>
            </div>

            <div className="inputbox">
              <ion-icon name="shield-checkmark-outline"></ion-icon>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <label>Confirm Password</label>
            </div>

            {err && <div className="error-msg">{err}</div>}

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? "Đang xử lý..." : "Sign Up"}
            </button>

            <div className="register">
              <p>
                Already have an account?{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onGoToLogin();
                  }}
                >
                  Log in
                </a>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
