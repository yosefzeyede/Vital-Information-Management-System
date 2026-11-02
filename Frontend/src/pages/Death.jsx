import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Edit,
  X,
  Ban,
  RefreshCw,
  Skull,
  CalendarDays,
  MapPin,
  User,
  FileText,
} from "lucide-react";
import "../pagecss/Death.css";

const API_URL = "http://localhost:4000/api";

const initialForm = {
  person_id: "",
  location_id: "",
  death_date: "",
  cause_of_death: "",
  registration_date: "",
};

const Death = () => {
  const [deaths, setDeaths] = useState([]);
  const [persons, setPersons] = useState([]);
  const [locations, setLocations] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingDeath, setEditingDeath] = useState(null);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedDeath, setSelectedDeath] = useState(null);
  const [cancelReason, setCancelReason] = useState("");

  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // ==================== AUTH HEADERS ====================

  const getHeaders = () => {
    const token = localStorage.getItem("token");

    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  // ==================== API RESPONSE HANDLING ====================

  const readResponse = async (response) => {
    const text = await response.text();

    let data;

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(
        `Server returned an invalid response. HTTP ${response.status}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        data.message || `Request failed. HTTP ${response.status}`,
      );
    }

    return data;
  };

  // ==================== LOAD DATA ====================

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const [deathResponse, personResponse, locationResponse] =
        await Promise.all([
          fetch(`${API_URL}/deaths`, {
            headers: getHeaders(),
          }),
          fetch(`${API_URL}/persons`, {
            headers: getHeaders(),
          }),
          fetch(`${API_URL}/locations`, {
            headers: getHeaders(),
          }),
        ]);

      const [deathData, personData, locationData] = await Promise.all([
        readResponse(deathResponse),
        readResponse(personResponse),
        readResponse(locationResponse),
      ]);

      setDeaths(deathData.deaths || []);
      setPersons(personData.persons || []);
      setLocations(locationData.locations || []);
    } catch (err) {
      console.error("Load death data error:", err);
      setError(err.message || "Failed to load death records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ==================== FORM HANDLING ====================

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const openCreateForm = () => {
    setEditingDeath(null);

    setForm({
      ...initialForm,
      registration_date: new Date().toLocaleDateString("en-CA"),
    });

    setError("");
    setSuccess("");
    setShowForm(true);
  };

  const openEditForm = (death) => {
    setEditingDeath(death);

    setForm({
      person_id: String(death.person_id || ""),
      location_id: death.location_id ? String(death.location_id) : "",
      death_date: death.death_date ? String(death.death_date).slice(0, 10) : "",
      cause_of_death: death.cause_of_death || "",
      registration_date: death.registration_date
        ? String(death.registration_date).slice(0, 10)
        : "",
      status: death.status || "Pending",
    });

    setError("");
    setSuccess("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingDeath(null);
    setForm(initialForm);
    setError("");
  };

  // ==================== CREATE / UPDATE DEATH ====================

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    const user = JSON.parse(localStorage.getItem("user") || "{}");

    if (!user.user_id) {
      setError("User information not found. Please login again.");
      return;
    }

    if (!form.person_id || !form.death_date || !form.registration_date) {
      setError("Please fill in all required fields.");
      return;
    }

    const payload = {
      person_id: Number(form.person_id),
      location_id: form.location_id ? Number(form.location_id) : null,
      death_date: form.death_date,
      cause_of_death: form.cause_of_death.trim() || null,
      registration_date: form.registration_date,
      registered_by: Number(user.user_id),
    };

    if (editingDeath) {
      payload.status = form.status;
    }

    const url = editingDeath
      ? `${API_URL}/deaths/${editingDeath.death_id}`
      : `${API_URL}/deaths`;

    const method = editingDeath ? "PUT" : "POST";

    setSaving(true);

    try {
      const response = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await readResponse(response);

      setSuccess(data.message || "Death record saved successfully.");

      setShowForm(false);
      setEditingDeath(null);
      setForm(initialForm);

      await loadData();
    } catch (err) {
      console.error("Save death error:", err);
      setError(err.message || "Failed to save death record");
    } finally {
      setSaving(false);
    }
  };

  // ==================== CANCEL DEATH ====================

  const openCancelModal = (death) => {
    setSelectedDeath(death);
    setCancelReason("");
    setError("");
    setShowCancelModal(true);
  };

  const closeCancelModal = () => {
    setShowCancelModal(false);
    setSelectedDeath(null);
    setCancelReason("");
  };

  const handleCancelDeath = async (e) => {
    e.preventDefault();

    if (!selectedDeath) return;

    if (!cancelReason.trim()) {
      setError("Cancellation reason is required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/deaths/${selectedDeath.death_id}/cancel`,
        {
          method: "PATCH",
          headers: getHeaders(),
          body: JSON.stringify({
            cancel_reason: cancelReason.trim(),
          }),
        },
      );

      const data = await readResponse(response);

      setSuccess(data.message || "Death record cancelled successfully.");

      closeCancelModal();
      await loadData();
    } catch (err) {
      console.error("Cancel death error:", err);
      setError(err.message || "Failed to cancel death record");
    } finally {
      setSaving(false);
    }
  };

  // ==================== SEARCH AND FILTER ====================

  const filteredDeaths = useMemo(() => {
    return deaths.filter((death) => {
      const fullName = [death.first_name, death.middle_name, death.last_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const searchValue = search.toLowerCase();

      const matchesSearch =
        fullName.includes(searchValue) ||
        String(death.death_id).includes(searchValue) ||
        String(death.record_id).includes(searchValue) ||
        String(death.person_id).includes(searchValue);

      const matchesStatus =
        statusFilter === "All" || death.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [deaths, search, statusFilter]);

  // ==================== SUMMARY ====================

  const totalDeaths = deaths.length;

  const pendingDeaths = deaths.filter(
    (death) => death.status === "Pending",
  ).length;

  const activeDeaths = deaths.filter(
    (death) => death.status === "Active",
  ).length;

  const cancelledDeaths = deaths.filter(
    (death) => death.status === "Cancelled",
  ).length;

  // ==================== DATE FORMAT ====================

  const formatDate = (date) => {
    if (!date) return "-";

    return String(date).slice(0, 10);
  };

  // ==================== LOCATION DISPLAY ====================

  const getLocationName = (locationId) => {
    if (!locationId) return "-";

    const location = locations.find(
      (item) => Number(item.location_id) === Number(locationId),
    );

    if (!location) return "-";

    return [location.region, location.zone, location.woreda, location.kebele]
      .filter(Boolean)
      .join(", ");
  };

  // ==================== RENDER ====================

  return (
    <div className="death-page">
      {/* HEADER */}

      <div className="death-header">
        <div className="death-header-left">
          <div className="death-header-icon">
            <Skull size={28} />
          </div>

          <div>
            <h1>Death Registration</h1>
            <p>Manage and maintain death registration records.</p>
          </div>
        </div>

        <button className="death-add-btn" onClick={openCreateForm}>
          <Plus size={19} />
          Register Death
        </button>
      </div>

      {/* NOTIFICATIONS */}

      {error && !showForm && !showCancelModal && (
        <div className="death-alert death-alert-error">
          {error}
          <button onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}

      {success && (
        <div className="death-alert death-alert-success">
          {success}
          <button onClick={() => setSuccess("")}>
            <X size={17} />
          </button>
        </div>
      )}

      {/* SUMMARY CARDS */}

      <div className="death-summary">
        <div className="death-summary-card">
          <div className="death-summary-icon total">
            <FileText size={22} />
          </div>
          <div>
            <p>Total Records</p>
            <h2>{totalDeaths}</h2>
          </div>
        </div>

        <div className="death-summary-card">
          <div className="death-summary-icon pending">
            <CalendarDays size={22} />
          </div>
          <div>
            <p>Pending</p>
            <h2>{pendingDeaths}</h2>
          </div>
        </div>

        <div className="death-summary-card">
          <div className="death-summary-icon active">
            <User size={22} />
          </div>
          <div>
            <p>Active</p>
            <h2>{activeDeaths}</h2>
          </div>
        </div>

        <div className="death-summary-card">
          <div className="death-summary-icon cancelled">
            <Ban size={22} />
          </div>
          <div>
            <p>Cancelled</p>
            <h2>{cancelledDeaths}</h2>
          </div>
        </div>
      </div>

      {/* TABLE SECTION */}

      <div className="death-content">
        <div className="death-toolbar">
          <div className="death-search">
            <Search size={19} />
            <input
              type="text"
              placeholder="Search by person name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="death-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Active">Active</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          <button
            className="death-refresh-btn"
            onClick={loadData}
            title="Refresh"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {loading ? (
          <div className="death-loading">
            <RefreshCw className="death-spin" size={28} />
            <p>Loading death records...</p>
          </div>
        ) : (
          <div className="death-table-wrapper">
            <table className="death-table">
              <thead>
                <tr>
                  <th>Death ID</th>
                  <th>Deceased Person</th>
                  <th>Death Date</th>
                  <th>Cause of Death</th>
                  <th>Location</th>
                  <th>Registration Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredDeaths.length > 0 ? (
                  filteredDeaths.map((death) => (
                    <tr key={death.death_id}>
                      <td>#{death.death_id}</td>

                      <td>
                        <div className="death-person">
                          <div className="death-person-avatar">
                            {death.first_name?.charAt(0)?.toUpperCase() || "?"}
                          </div>

                          <div>
                            <strong>
                              {death.first_name} {death.middle_name}{" "}
                              {death.last_name}
                            </strong>
                            <small>Person ID: {death.person_id}</small>
                          </div>
                        </div>
                      </td>

                      <td>{formatDate(death.death_date)}</td>

                      <td>{death.cause_of_death || "Not specified"}</td>

                      <td className="death-location-cell">
                        {getLocationName(death.location_id)}
                      </td>

                      <td>{formatDate(death.registration_date)}</td>

                      <td>
                        <span
                          className={`death-status ${String(
                            death.status,
                          ).toLowerCase()}`}
                        >
                          {death.status}
                        </span>
                      </td>

                      <td>
                        <div className="death-actions">
                          {death.status !== "Cancelled" && (
                            <>
                              <button
                                className="death-edit-btn"
                                title="Edit"
                                onClick={() => openEditForm(death)}
                              >
                                <Edit size={16} />
                              </button>

                              <button
                                className="death-cancel-btn"
                                title="Cancel"
                                onClick={() => openCancelModal(death)}
                              >
                                <Ban size={16} />
                              </button>
                            </>
                          )}

                          {death.status === "Cancelled" && (
                            <span className="death-no-action">No actions</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="death-empty">
                      <Skull size={35} />
                      <p>No death records found.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="death-table-footer">
          Showing {filteredDeaths.length} of {deaths.length} records
        </div>
      </div>

      {/* CREATE / EDIT MODAL */}

      {showForm && (
        <div className="death-modal-overlay">
          <div className="death-modal">
            <div className="death-modal-header">
              <div>
                <h2>
                  {editingDeath ? "Update Death Record" : "Register Death"}
                </h2>
                <p>
                  {editingDeath
                    ? "Update the death registration information."
                    : "Enter the deceased person's information."}
                </p>
              </div>

              <button className="death-modal-close" onClick={closeForm}>
                <X size={21} />
              </button>
            </div>

            {error && (
              <div className="death-alert death-alert-error">{error}</div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="death-form-grid">
                {/* PERSON */}

                <div className="death-form-group full">
                  <label>
                    Deceased Person <span>*</span>
                  </label>

                  <select
                    name="person_id"
                    value={form.person_id}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Person</option>

                    {persons.map((person) => (
                      <option key={person.person_id} value={person.person_id}>
                        {person.first_name} {person.middle_name}{" "}
                        {person.last_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* DEATH DATE */}

                <div className="death-form-group">
                  <label>
                    Death Date <span>*</span>
                  </label>

                  <input
                    type="date"
                    name="death_date"
                    value={form.death_date}
                    onChange={handleChange}
                    max={new Date().toLocaleDateString("en-CA")}
                    required
                  />
                </div>

                {/* REGISTRATION DATE */}

                <div className="death-form-group">
                  <label>
                    Registration Date <span>*</span>
                  </label>

                  <input
                    type="date"
                    name="registration_date"
                    value={form.registration_date}
                    onChange={handleChange}
                    required
                  />
                </div>

                {/* LOCATION */}

                <div className="death-form-group full">
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
                          .join(", ")}
                      </option>
                    ))}
                  </select>
                </div>

                {/* CAUSE */}

                <div className="death-form-group full">
                  <label>Cause of Death</label>

                  <textarea
                    name="cause_of_death"
                    value={form.cause_of_death}
                    onChange={handleChange}
                    placeholder="Enter cause of death (optional)"
                    maxLength={255}
                    rows={3}
                  />

                  <small>Maximum 255 characters.</small>
                </div>

                {/* STATUS - EDIT ONLY */}

                {editingDeath && (
                  <div className="death-form-group full">
                    <label>Status</label>

                    <select
                      name="status"
                      value={form.status}
                      onChange={handleChange}
                    >
                      <option value="Pending">Pending</option>
                      <option value="Active">Active</option>
                    </select>

                    <small>Cancelled records cannot be updated.</small>
                  </div>
                )}
              </div>

              <div className="death-form-actions">
                <button
                  type="button"
                  className="death-secondary-btn"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="death-submit-btn"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingDeath
                      ? "Update Record"
                      : "Register Death"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL MODAL */}

      {showCancelModal && selectedDeath && (
        <div className="death-modal-overlay">
          <div className="death-modal death-cancel-modal">
            <div className="death-modal-header">
              <div>
                <h2>Cancel Death Record</h2>
                <p>
                  You are cancelling death record #{selectedDeath.death_id}.
                </p>
              </div>

              <button className="death-modal-close" onClick={closeCancelModal}>
                <X size={21} />
              </button>
            </div>

            {error && (
              <div className="death-alert death-alert-error">{error}</div>
            )}

            <form onSubmit={handleCancelDeath}>
              <div className="death-form-group">
                <label>
                  Cancellation Reason <span>*</span>
                </label>

                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Enter the reason for cancellation..."
                  rows={4}
                  maxLength={500}
                  required
                />

                <small>Maximum 500 characters.</small>
              </div>

              <div className="death-form-actions">
                <button
                  type="button"
                  className="death-secondary-btn"
                  onClick={closeCancelModal}
                  disabled={saving}
                >
                  Go Back
                </button>

                <button
                  type="submit"
                  className="death-danger-submit"
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
};

export default Death;
