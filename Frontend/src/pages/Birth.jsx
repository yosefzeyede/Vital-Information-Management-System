import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Edit,
  X,
  Ban,
  RefreshCw,
  Baby,
  Users,
  MapPin,
  CalendarDays,
  AlertCircle,
} from "lucide-react";
import "../pagecss/Birth.css";

const API_URL = "http://localhost:4000/api";

const initialForm = {
  person_id: "",
  father_id: "",
  mother_id: "",
  location_id: "",
  registration_date: new Date().toISOString().slice(0, 10),
  status: "Pending",
};

function Birth() {
  const [births, setBirths] = useState([]);
  const [persons, setPersons] = useState([]);
  const [locations, setLocations] = useState([]);

  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [showForm, setShowForm] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelId, setCancelId] = useState(null);
  const [cancelReason, setCancelReason] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const token = localStorage.getItem("token");

  const getHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  });

  // Load births, persons, and locations
  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const [birthResponse, personResponse, locationResponse] =
        await Promise.all([
          fetch(`${API_URL}/births`, { headers: getHeaders() }),
          fetch(`${API_URL}/persons`, { headers: getHeaders() }),
          fetch(`${API_URL}/locations`, { headers: getHeaders() }),
        ]);

      const birthData = await birthResponse.json();
      const personData = await personResponse.json();
      const locationData = await locationResponse.json();

      if (!birthResponse.ok) {
        throw new Error(birthData.message || "Failed to load birth records");
      }

      if (!personResponse.ok) {
        throw new Error(personData.message || "Failed to load persons");
      }

      if (!locationResponse.ok) {
        throw new Error(locationData.message || "Failed to load locations");
      }

      setBirths(birthData.births || []);
      setPersons(personData.persons || []);
      setLocations(locationData.locations || []);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle form inputs
  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // Open create form
  const openCreateForm = () => {
    setEditingId(null);
    setForm(initialForm);
    setError("");
    setShowForm(true);
  };

  // Open edit form
  const openEditForm = (birth) => {
    setEditingId(birth.birth_id);

    setForm({
      person_id: birth.person_id || "",
      father_id: birth.father_id || "",
      mother_id: birth.mother_id || "",
      location_id: birth.location_id || "",
      registration_date: birth.registration_date
        ? String(birth.registration_date).slice(0, 10)
        : "",
      status: birth.status || "Pending",
    });

    setError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
    setError("");
  };

  // Submit create or update
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");

      if (!user.user_id) {
        throw new Error("Logged-in user ID was not found. Please login again.");
      }

      const payload = {
        person_id: Number(form.person_id),
        father_id: form.father_id ? Number(form.father_id) : null,
        mother_id: form.mother_id ? Number(form.mother_id) : null,
        location_id: form.location_id ? Number(form.location_id) : null,
        registration_date: form.registration_date,
        registered_by: Number(user.user_id),
      };

      let url = `${API_URL}/births`;
      let method = "POST";

      if (editingId) {
        url = `${API_URL}/births/${editingId}`;
        method = "PUT";
        payload.status = form.status;
      }

      const response = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to save birth record");
      }

      setSuccess(data.message || "Birth record saved successfully");
      closeForm();
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to save birth record");
    } finally {
      setSaving(false);
    }
  };

  // Open cancellation dialog
  const openCancelDialog = (birthId) => {
    setCancelId(birthId);
    setCancelReason("");
    setError("");
    setShowCancel(true);
  };

  // Cancel birth record
  const handleCancelBirth = async (e) => {
    e.preventDefault();

    if (!cancelReason.trim()) {
      setError("Please enter a cancellation reason");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/births/${cancelId}/cancel`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
          cancel_reason: cancelReason.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to cancel birth record");
      }

      setShowCancel(false);
      setCancelId(null);
      setCancelReason("");
      setSuccess(data.message || "Birth record cancelled successfully");

      await loadData();
    } catch (err) {
      setError(err.message || "Failed to cancel birth record");
    } finally {
      setSaving(false);
    }
  };

  // Filter births
  const filteredBirths = useMemo(() => {
    return births.filter((birth) => {
      const fullName = [
        birth.child_first_name,
        birth.child_middle_name,
        birth.child_last_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        fullName.includes(search.toLowerCase()) ||
        String(birth.birth_id).includes(search) ||
        String(birth.person_id).includes(search);

      const matchesStatus =
        statusFilter === "All" || birth.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [births, search, statusFilter]);

  const malePersons = persons.filter((person) => person.gender === "Male");

  const femalePersons = persons.filter((person) => person.gender === "Female");

  const getPersonName = (person) =>
    [person.first_name, person.middle_name, person.last_name]
      .filter(Boolean)
      .join(" ");

  const formatDate = (date) => {
    if (!date) return "-";

    const dateString = String(date).slice(0, 10);
    return dateString;
  };

  const getStatusClass = (status) => {
    if (status === "Active") return "birth-status-active";
    if (status === "Cancelled") return "birth-status-cancelled";
    return "birth-status-pending";
  };

  return (
    <div className="birth-page">
      {/* Page header */}
      <div className="birth-header">
        <div>
          <h1>Birth Records</h1>
          <p>Register and manage birth information</p>
        </div>

        <button className="birth-primary-btn" onClick={openCreateForm}>
          <Plus size={18} />
          Register Birth
        </button>
      </div>

      {/* Alerts */}
      {success && (
        <div className="birth-alert birth-success">
          <span>{success}</span>
          <button onClick={() => setSuccess("")}>
            <X size={17} />
          </button>
        </div>
      )}

      {error && !showForm && !showCancel && (
        <div className="birth-alert birth-error">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="birth-summary">
        <div className="birth-summary-card">
          <div className="birth-summary-icon">
            <Baby size={23} />
          </div>
          <div>
            <h3>{births.length}</h3>
            <p>Total Birth Records</p>
          </div>
        </div>

        <div className="birth-summary-card">
          <div className="birth-summary-icon pending-icon">
            <CalendarDays size={23} />
          </div>
          <div>
            <h3>{births.filter((b) => b.status === "Pending").length}</h3>
            <p>Pending</p>
          </div>
        </div>

        <div className="birth-summary-card">
          <div className="birth-summary-icon active-icon">
            <Users size={23} />
          </div>
          <div>
            <h3>{births.filter((b) => b.status === "Active").length}</h3>
            <p>Active</p>
          </div>
        </div>

        <div className="birth-summary-card">
          <div className="birth-summary-icon cancelled-icon">
            <Ban size={23} />
          </div>
          <div>
            <h3>{births.filter((b) => b.status === "Cancelled").length}</h3>
            <p>Cancelled</p>
          </div>
        </div>
      </div>

      {/* Search and filters */}
      <div className="birth-toolbar">
        <div className="birth-search">
          <Search size={19} />
          <input
            type="text"
            placeholder="Search by child name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="All">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Active">Active</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <button
          className="birth-refresh-btn"
          onClick={loadData}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Birth records table */}
      <div className="birth-table-container">
        <div className="birth-table-heading">
          <h2>Birth Records List</h2>
          <span>{filteredBirths.length} records</span>
        </div>

        {loading ? (
          <div className="birth-empty">
            <RefreshCw size={25} className="birth-loading-icon" />
            <p>Loading birth records...</p>
          </div>
        ) : filteredBirths.length === 0 ? (
          <div className="birth-empty">
            <Baby size={35} />
            <h3>No birth records found</h3>
            <p>Try another search or register a new birth record.</p>
          </div>
        ) : (
          <div className="birth-table-scroll">
            <table className="birth-table">
              <thead>
                <tr>
                  <th>Birth ID</th>
                  <th>Child Name</th>
                  <th>Father</th>
                  <th>Mother</th>
                  <th>Registration Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredBirths.map((birth) => (
                  <tr key={birth.birth_id}>
                    <td>#{birth.birth_id}</td>

                    <td className="birth-child-name">
                      {[
                        birth.child_first_name,
                        birth.child_middle_name,
                        birth.child_last_name,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </td>

                    <td>
                      {[birth.father_first_name, birth.father_last_name]
                        .filter(Boolean)
                        .join(" ") || "-"}
                    </td>

                    <td>
                      {[birth.mother_first_name, birth.mother_last_name]
                        .filter(Boolean)
                        .join(" ") || "-"}
                    </td>

                    <td>{formatDate(birth.registration_date)}</td>

                    <td>
                      <span
                        className={`birth-status ${getStatusClass(birth.status)}`}
                      >
                        {birth.status}
                      </span>
                    </td>

                    <td>
                      <div className="birth-actions">
                        <button
                          className="birth-edit-btn"
                          title="Edit"
                          onClick={() => openEditForm(birth)}
                          disabled={birth.status === "Cancelled"}
                        >
                          <Edit size={17} />
                        </button>

                        <button
                          className="birth-cancel-btn"
                          title="Cancel birth record"
                          onClick={() => openCancelDialog(birth.birth_id)}
                          disabled={birth.status === "Cancelled"}
                        >
                          <Ban size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="birth-modal-overlay">
          <div className="birth-modal">
            <div className="birth-modal-header">
              <div>
                <h2>{editingId ? "Update Birth Record" : "Register Birth"}</h2>
                <p>
                  {editingId
                    ? "Update the existing birth information"
                    : "Enter the child's and parents' information"}
                </p>
              </div>

              <button className="birth-close-btn" onClick={closeForm}>
                <X size={21} />
              </button>
            </div>

            {error && (
              <div className="birth-alert birth-error">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="birth-form-section">
                <h3>
                  <Baby size={18} />
                  Child Information
                </h3>

                <div className="birth-form-group">
                  <label>Child *</label>
                  <select
                    name="person_id"
                    value={form.person_id}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Child</option>
                    {persons.map((person) => (
                      <option key={person.person_id} value={person.person_id}>
                        {person.first_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="birth-form-section">
                <h3>
                  <Users size={18} />
                  Parent Information
                </h3>

                <div className="birth-form-grid">
                  <div className="birth-form-group">
                    <label>Father</label>
                    <select
                      name="father_id"
                      value={form.father_id}
                      onChange={handleChange}
                    >
                      <option value="">Select Father (Optional)</option>
                      {persons
                        .filter((person) => person.gender === "Female")
                        .map((person) => (
                          <option
                            key={person.person_id}
                            value={person.person_id}
                          >
                            {person.middle_name} {person.last_name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="birth-form-group">
                    <label>Mother</label>
                    <select
                      name="mother_id"
                      value={form.mother_id}
                      onChange={handleChange}
                    >
                      <option value="">Select Mother (Optional)</option>
                      {persons
                        .filter((person) => person.gender === "Female")
                        .map((person) => (
                          <option
                            key={person.person_id}
                            value={person.person_id}
                          >
                            {person.middle_name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="birth-form-section">
                <h3>
                  <MapPin size={18} />
                  Registration Information
                </h3>

                <div className="birth-form-grid">
                  <div className="birth-form-group">
                    <label>Location</label>
                    <select
                      name="location_id"
                      value={form.location_id}
                      onChange={handleChange}
                    >
                      <option value="">Select Location (Optional)</option>
                      {locations.map((location) => (
                        <option
                          key={location.location_id}
                          value={location.location_id}
                        >
                          {[
                            location.region,
                            location.zone,
                            location.woreda,
                            location.kebele,
                          ]
                            .filter(Boolean)
                            .join(" - ")}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="birth-form-group">
                    <label>Registration Date *</label>
                    <input
                      type="date"
                      name="registration_date"
                      value={form.registration_date}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                {editingId && (
                  <div className="birth-form-group">
                    <label>Status</label>
                    <select
                      name="status"
                      value={form.status}
                      onChange={handleChange}
                      required
                    >
                      <option value="Pending">Pending</option>
                      <option value="Active">Active</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="birth-modal-footer">
                <button
                  type="button"
                  className="birth-secondary-btn"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="birth-primary-btn"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Update Record"
                      : "Register Birth"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancel && (
        <div className="birth-modal-overlay">
          <div className="birth-modal birth-cancel-modal">
            <div className="birth-modal-header">
              <div>
                <h2>Cancel Birth Record</h2>
                <p>
                  This action will preserve the record but change its status.
                </p>
              </div>

              <button
                className="birth-close-btn"
                onClick={() => setShowCancel(false)}
              >
                <X size={21} />
              </button>
            </div>

            {error && (
              <div className="birth-alert birth-error">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCancelBirth}>
              <div className="birth-form-group">
                <label>Cancellation Reason *</label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Enter the reason for cancelling this birth record..."
                  maxLength={500}
                  rows={4}
                  required
                />
                <small>{cancelReason.length}/500 characters</small>
              </div>

              <div className="birth-modal-footer">
                <button
                  type="button"
                  className="birth-secondary-btn"
                  onClick={() => setShowCancel(false)}
                  disabled={saving}
                >
                  Go Back
                </button>

                <button
                  type="submit"
                  className="birth-danger-btn"
                  disabled={saving}
                >
                  {saving ? "Cancelling..." : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Birth;
