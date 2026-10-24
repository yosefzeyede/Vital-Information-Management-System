import { useCallback, useEffect, useState } from "react";
import {
  Search,
  UserPlus,
  Pencil,
  Trash2,
  X,
  Users,
  RefreshCw,
  MapPin,
} from "lucide-react";
import "../pagecss/Persons.css";

const API_URL = "http://localhost:4000/api";

const emptyForm = {
  first_name: "",
  middle_name: "",
  last_name: "",
  gender: "Male",
  date_of_birth: "",
  phone: "",
  address: "",
  location_id: "",
};

function Persons() {
  const [persons, setPersons] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getHeaders = () => {
    const token = localStorage.getItem("token");

    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  const readResponse = async (response) => {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || `Request failed (${response.status})`);
    }

    return data;
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [peopleResponse, locationsResponse] = await Promise.all([
        fetch(`${API_URL}/persons`, {
          headers: getHeaders(),
        }),
        fetch(`${API_URL}/locations`, {
          headers: getHeaders(),
        }),
      ]);

      const [peopleData, locationsData] = await Promise.all([
        readResponse(peopleResponse),
        readResponse(locationsResponse),
      ]);

      setPersons(peopleData.persons || []);
      setLocations(locationsData.locations || []);
    } catch (err) {
      setError(err.message || "Unable to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateField = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const openCreateForm = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setError("");
    setSuccess("");
    setShowForm(true);
  };

  const openEditForm = (person) => {
    setEditingId(person.person_id);
    setForm({
      first_name: person.first_name || "",
      middle_name: person.middle_name || "",
      last_name: person.last_name || "",
      gender: person.gender || "Male",
      date_of_birth: person.date_of_birth
        ? String(person.date_of_birth).slice(0, 10)
        : "",
      phone: person.phone || "",
      address: person.address || "",
      location_id: person.location_id ? String(person.location_id) : "",
    });
    setError("");
    setSuccess("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const payload = {
      ...form,
      first_name: form.first_name.trim(),
      middle_name: form.middle_name.trim(),
      last_name: form.last_name.trim(),
      date_of_birth: form.date_of_birth || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      location_id: form.location_id ? Number(form.location_id) : null,
    };

    setSaving(true);

    try {
      const isEditing = editingId !== null;
      const url = isEditing
        ? `${API_URL}/persons/${editingId}`
        : `${API_URL}/persons`;

      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await readResponse(response);

      setSuccess(
        data.message ||
          (isEditing
            ? "Person updated successfully."
            : "Person registered successfully."),
      );

      closeForm();
      await fetchData();
    } catch (err) {
      setError(err.message || "Unable to save person.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (person) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${person.first_name} ${person.last_name}?`,
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API_URL}/persons/${person.person_id}`, {
        method: "DELETE",
        headers: getHeaders(),
      });

      const data = await readResponse(response);

      setSuccess(data.message || "Person deleted successfully.");
      await fetchData();
    } catch (err) {
      setError(err.message || "Unable to delete person.");
    }
  };

  const getLocationName = (person) => {
    const location = locations.find(
      (item) => Number(item.location_id) === Number(person.location_id),
    );

    if (!location) return "Not assigned";

    return [
      location.region,
      location.zone,
      location.city,
      location.woreda,
      location.kebele,
    ]
      .filter(Boolean)
      .join(", ");
  };

  const filteredPersons = persons.filter((person) => {
    const text = [
      person.person_id,
      person.first_name,
      person.middle_name,
      person.last_name,
      person.phone,
      person.gender,
      getLocationName(person),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return text.includes(search.trim().toLowerCase());
  });

  return (
    <main className="persons-page">
      <header className="persons-header">
        <div>
          <span className="persons-eyebrow">RECORD MANAGEMENT</span>
          <h1>Persons Management</h1>
          <p>Register, view, update, and manage personal information.</p>
        </div>

        <button
          className="persons-primary-btn"
          type="button"
          onClick={openCreateForm}
        >
          <UserPlus size={18} />
          Add Person
        </button>
      </header>

      {error && (
        <div className="persons-alert persons-alert-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}

      {success && (
        <div className="persons-alert persons-alert-success" role="status">
          <span>{success}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setSuccess("")}
          >
            <X size={17} />
          </button>
        </div>
      )}

      <section className="persons-summary">
        <div className="persons-summary-icon">
          <Users size={23} />
        </div>
        <div>
          <span>Total registered persons</span>
          <strong>{persons.length}</strong>
        </div>
      </section>

      <section className="persons-list-card">
        <div className="persons-list-header">
          <div>
            <h2>Registered Persons</h2>
            <p>{filteredPersons.length} record(s) found</p>
          </div>

          <button
            className="persons-refresh-btn"
            type="button"
            onClick={fetchData}
            disabled={loading}
            title="Refresh records"
          >
            <RefreshCw size={17} />
            Refresh
          </button>
        </div>

        <div className="persons-search">
          <Search size={19} />
          <input
            type="search"
            placeholder="Search by name, ID, phone, or location..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {loading ? (
          <div className="persons-state">
            <RefreshCw className="persons-spinner" size={25} />
            <p>Loading persons...</p>
          </div>
        ) : filteredPersons.length === 0 ? (
          <div className="persons-state">
            <Users size={34} />
            <h3>No persons found</h3>
            <p>
              {search
                ? "Try another search term."
                : "Add a person to get started."}
            </p>
          </div>
        ) : (
          <div className="persons-table-wrapper">
            <table className="persons-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Full Name</th>
                  <th>Gender</th>
                  <th>Date of Birth</th>
                  <th>Phone</th>
                  <th>Location</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPersons.map((person) => (
                  <tr key={person.person_id}>
                    <td>#{person.person_id}</td>
                    <td className="persons-name-cell">
                      {person.first_name} {person.middle_name}{" "}
                      {person.last_name}
                    </td>
                    <td>
                      <span className="persons-gender">{person.gender}</span>
                    </td>
                    <td>
                      {person.date_of_birth
                        ? String(person.date_of_birth).slice(0, 10)
                        : "—"}
                    </td>
                    <td>{person.phone || "—"}</td>
                    <td className="persons-location-cell">
                      <MapPin size={15} />
                      <span>{getLocationName(person)}</span>
                    </td>
                    <td>
                      <div className="persons-actions">
                        <button
                          className="persons-edit-btn"
                          type="button"
                          title="Edit person"
                          aria-label={`Edit person ${person.person_id}`}
                          onClick={() => openEditForm(person)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="persons-delete-btn"
                          type="button"
                          title="Delete person"
                          aria-label={`Delete person ${person.person_id}`}
                          onClick={() => handleDelete(person)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showForm && (
        <div className="persons-modal-backdrop">
          <section
            className="persons-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="persons-form-title"
          >
            <div className="persons-modal-header">
              <div>
                <h2 id="persons-form-title">
                  {editingId !== null ? "Edit Person" : "Register Person"}
                </h2>
                <p>Enter the person's information below.</p>
              </div>
              <button
                className="persons-close-btn"
                type="button"
                onClick={closeForm}
                aria-label="Close form"
              >
                <X size={21} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="persons-form-grid">
                <label>
                  First Name *
                  <input
                    name="first_name"
                    value={form.first_name}
                    onChange={updateField}
                    maxLength={50}
                    required
                  />
                </label>

                <label>
                  Middle Name *
                  <input
                    name="middle_name"
                    value={form.middle_name}
                    onChange={updateField}
                    maxLength={50}
                    required
                  />
                </label>

                <label>
                  Last Name *
                  <input
                    name="last_name"
                    value={form.last_name}
                    onChange={updateField}
                    maxLength={50}
                    required
                  />
                </label>

                <label>
                  Gender *
                  <select
                    name="gender"
                    value={form.gender}
                    onChange={updateField}
                    required
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </label>

                <label>
                  Date of Birth
                  <input
                    type="date"
                    name="date_of_birth"
                    value={form.date_of_birth}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={updateField}
                  />
                </label>

                <label>
                  Phone Number
                  <input
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={updateField}
                    placeholder="09XXXXXXXX or 07XXXXXXXX"
                    maxLength={10}
                  />
                </label>

                <label className="persons-form-full">
                  Address
                  <input
                    name="address"
                    value={form.address}
                    onChange={updateField}
                    maxLength={255}
                    placeholder="Enter address"
                  />
                </label>

                <label className="persons-form-full">
                  Location
                  <select
                    name="location_id"
                    value={form.location_id}
                    onChange={updateField}
                  >
                    <option value="">No location selected</option>
                    {locations.map((location) => (
                      <option
                        key={location.location_id}
                        value={location.location_id}
                      >
                        {[
                          location.region,
                          location.zone,
                          location.city,
                          location.woreda,
                          location.kebele,
                        ]
                          .filter(Boolean)
                          .join(" — ")}
                      </option>
                    ))}
                  </select>
                  {locations.length === 0 && (
                    <small>
                      No locations available. Add a location first if needed.
                    </small>
                  )}
                </label>
              </div>

              <div className="persons-form-actions">
                <button
                  className="persons-cancel-btn"
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="persons-primary-btn"
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingId !== null
                      ? "Save Changes"
                      : "Register Person"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default Persons;
