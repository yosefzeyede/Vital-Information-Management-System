import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../Images/vital_logo.png";
import {
  LayoutDashboard,
  Users,
  Baby,
  HeartPulse,
  FileText,
  MapPin,
  LogOut,
  Heart,
  UserRound,
  ClipboardList,
  Clock,
} from "lucide-react";
import "../pagecss/Dashboard.css";

const API_URL = "http://localhost:4000/api";

function Dashboard() {
  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const token = localStorage.getItem("token");

        const response = await fetch(`${API_URL}/dashboard/summary`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();
        console.log(data);
        if (!response.ok) {
          throw new Error(data.message || "Failed to load dashboard");
        }

        setSummary(data.summary);
      } catch (err) {
        setError(err.message || "Unable to connect to server");
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const cards = [
    {
      title: "Total Persons",
      value: summary?.total_persons ?? 0,
      icon: Users,
    },
    {
      title: "Total Records",
      value: summary?.total_records ?? 0,
      icon: ClipboardList,
    },
    {
      title: "Pending Records",
      value: summary?.pending_records ?? 0,
      icon: Clock,
    },
    {
      title: "Active Certificates",
      value: summary?.active_certificates ?? 0,
      icon: FileText,
    },
    {
      title: "Birth Records",
      value: summary?.total_births ?? 0,
      icon: Baby,
    },
    {
      title: "Death Records",
      value: summary?.total_deaths ?? 0,
      icon: HeartPulse,
    },
    {
      title: "Marriage Records",
      value: summary?.total_marriages ?? 0,
      icon: Heart,
    },
    {
      title: "Divorce Records",
      value: summary?.total_divorces ?? 0,
      icon: UserRound,
    },
    {
      title: "Adoption Records",
      value: summary?.total_adoptions ?? 0,
      icon: UserRound,
    },
  ];

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img className="image_logo" src={logo}></img>
        </div>

        <nav className="sidebar-nav">
          <button className="nav-item active">
            <LayoutDashboard size={19} />
            Dashboard
          </button>

          <button onClick={() => navigate("/persons")} className="nav-item">
            <Users size={19} />
            Persons
          </button>

          <button className="nav-item">
            <Baby size={19} />
            Birth Records
          </button>

          <button className="nav-item">
            <HeartPulse size={19} />
            Death Records
          </button>

          <button className="nav-item">
            <Heart size={19} />
            Marriage Records
          </button>

          <button className="nav-item">
            <FileText size={19} />
            Certificates
          </button>

          <button className="nav-item">
            <MapPin size={19} />
            Locations
          </button>
        </nav>

        <button className="nav-item logout-button" onClick={handleLogout}>
          <LogOut size={19} />
          Logout
        </button>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <h1>Dashboard</h1>
            <p>Vital Information Management System</p>
          </div>

          <div className="user-info">
            <div className="user-avatar">
              {(user.username || "U").charAt(0).toUpperCase()}
            </div>
            <div>
              <strong>{user.username || "User"}</strong>
              <span>{user.role || "Officer"}</span>
            </div>
          </div>
        </header>

        <section className="welcome-section">
          <div>
            <h2>Welcome to VIMS</h2>
            <p>Manage persons, vital records, and certificates in one place.</p>
          </div>
          <ClipboardList size={48} />
        </section>

        <section className="summary-section">
          <h2>System Overview</h2>

          {loading && <p>Loading dashboard statistics...</p>}

          {!loading && error && (
            <div className="dashboard-error">
              <p>{error}</p>
              <button onClick={() => window.location.reload()}>
                Try Again
              </button>
            </div>
          )}

          {!loading && !error && (
            <div className="summary-grid">
              {cards.map((card) => {
                const Icon = card.icon;

                return (
                  <article className="summary-card" key={card.title}>
                    <div className="summary-card-icon">
                      <Icon size={23} />
                    </div>
                    <p>{card.title}</p>
                    <h3>{card.value}</h3>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function LandmarkIcon() {
  return <MapPin size={25} />;
}

export default Dashboard;
