import { useState } from "react";
import { apiPost } from "../api";

export function LoginScreen({ onLogin, onBack, onGoToRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");

    if (!email.trim() || !password.trim()) {
      setErr("Vui lòng nhập đầy đủ Email và Password.");
      return;
    }

    setLoading(true);
    try {
      const data = await apiPost("/api/auth/login", { email: email.trim(), password });
      onLogin({ email: data.user.email, token: data.token });
    } catch (e2) {
      setErr(e2.message || "Sai email hoặc mật khẩu.");
    } finally {
      setLoading(false);
    }
  }

  const scopedCSS = `
    .login-container {
      font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      width: 100vw;
      box-sizing: border-box;
      background: linear-gradient(
        to bottom,
        rgba(0, 0, 0, 0.6),
        rgba(0, 0, 0, 0.8)
      ),
      url('https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1920&auto=format&fit=crop') no-repeat center center / cover;
      position: relative;
    }
    .login-container .back-btn {
      position: absolute;
      left: 20px;
      top: 20px;
      padding: 11px 13px;
      border-radius: 8px;
      border: 1px solid rgba(148,163,184,0.12);
      background: transparent;
      color: #ffffff;
      cursor: pointer;
      font-size: 13px;
      z-index: 10;
    }
    .login-container .form-box {
      position: relative;
      width: 400px;
      height: 450px;
      background: transparent;
      border: 2px solid rgba(255,255,255,0.5);
      border-radius: 20px;
      backdrop-filter: blur(15px);
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .login-container h2 {
      font-size: 2em;
      color: #fff;
      text-align: center;
      margin-bottom: 20px;
    }
    .login-container .inputbox {
      position: relative;
      margin: 30px 0;
      width: 310px;
      border-bottom: 2px solid #fff;
    }
    .login-container .inputbox label {
      position: absolute;
      top: 50%;
      left: 5px;
      transform: translateY(-50%);
      color: #fff;
      font-size: 1em;
      pointer-events: none;
      transition: .5s;
    }
    .login-container .inputbox input:focus ~ label,
    .login-container .inputbox input:valid ~ label {
      top: -5px;
    }
    .login-container .inputbox input {
      width: 100%;
      height: 50px;
      background: transparent;
      border: none;
      outline: none;
      font-size: 1em;
      padding: 0 35px 0 5px;
      color: #fff;
    }
    .login-container .inputbox ion-icon {
      position: absolute;
      right: 8px;
      color: #fff;
      font-size: 1.2em;
      top: 20px;
    }
    .login-container .forget {
      margin: -15px 0 15px;
      font-size: .9em;
      color: #fff;
      display: flex;
      justify-content: space-between;
    }
    .login-container .forget label input {
      margin-right: 3px;
    }
    .login-container .forget label a {
      color: #fff;
      text-decoration: none;
    }
    .login-container .forget label a:hover {
      text-decoration: underline;
    }
    .login-container .btn-login {
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
    }
    .login-container .register {
      font-size: .9em;
      color: #fff;
      text-align: center;
      margin: 25px 0 10px;
    }
    .login-container .register p a {
      text-decoration: none;
      color: #fff;
      font-weight: 600;
    }
    .login-container .register p a:hover {
      text-decoration: underline;
    }
    .login-container .error-msg {
      background: rgba(239,68,68,0.12);
      border: 1px solid rgba(239,68,68,0.35);
      color: #ffffff;
      padding: 10px;
      border-radius: 10px;
      font-size: 12px;
      text-align: center;
      margin-bottom: 15px;
    }
  `;


  return (
    <div className="login-container">
      <style>{scopedCSS}</style>

      {onBack && (
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
      )}

      <div className="form-box">
        <div className="form-value">
          <form onSubmit={handleSubmit}>
            <h2>Login</h2>

            <div className="inputbox">
              <ion-icon name="person-outline"></ion-icon>
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

            <div className="forget">
              <label>
                <input type="checkbox" /> Remember Me
              </label>
              <a href="#">Forget Password</a>
            </div>

            {err && <div className="error-msg">{err}</div>}

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? "Đang xử lý..." : "Log in"}
            </button>

            <div className="register">
              <p>
                Don't have an account?{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onGoToRegister();
                  }}
                >
                  Register
                </a>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
