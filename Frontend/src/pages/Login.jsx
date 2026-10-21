import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Landmark, Eye, EyeOff, User, Lock } from "lucide-react";
import "./Login.css";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("http://localhost:4000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed.");
      }

      // Store the token returned by the backend.
      if (!data.token) {
        throw new Error("The server did not return an authentication token.");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem(
        "user",
        JSON.stringify({
          user_id: data.user_id,
          username: data.username,
          role: data.role,
        }),
      );

      navigate("/dashboard");
    } catch (err) {
      setError(
        err.message === "Failed to fetch"
          ? "Cannot connect to the server. Please check that the backend is running."
          : err.message,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <div className="login-logo">
            <Landmark size={34} />
          </div>

          <h1>Vital Information</h1>
          <p>Management System</p>
        </div>

        <div className="login-heading">
          <h2>Welcome Back</h2>
          <p>Sign in to access your account</p>
        </div>

        <form onSubmit={handleLogin}>
          {error && <div className="login-error">{error}</div>}

          <label htmlFor="username">Username</label>
          <div className="login-input-wrapper">
            <User size={19} />
            <input
              id="username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <label htmlFor="password">Password</label>
          <div className="login-input-wrapper">
            <Lock size={19} />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              className="password-toggle"
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>

          <button className="login-button" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="login-footer">Secure access for authorized personnel</p>
      </section>
    </main>
  );
}

export default Login;
