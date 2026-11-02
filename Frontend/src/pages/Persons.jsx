import { useState } from "react";
import {
  Search,
  UserPlus,
  Pencil,
  Trash2,
  X,
  Users,
  MapPin,
  UserRound,
  MapPinned,
  AlertCircle,
  CheckCircle,
  RefreshCw,
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
  region: "",
  zone: "",
  city: "",
  woreda: "",
  kebele: "",
  got: "",
};

function Persons() {
  const [persons, setPersons] = useState([]);
  const [form, setForm] = useState({ ...emptyForm });

  const [search, setSearch] = useState("");
  const [searched, setSearched] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  });

  const readResponse = async (response) => {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const details = Array.isArray(data.errors) ? data.errors.join(". ") : "";

      throw new Error(
        details || data.message || `Request failed (${response.status})`,
      );
    }

    return data;
  };

  // Search persons from the backend.
  const handleSearch = async (event) => {
    event.preventDefault();

    const query = search.trim();

    if (!query) {
      setPersons([]);
      setSearched(false);
      setError("Please enter a person ID or name to search.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `${API_URL}/persons/search?query=${encodeURIComponent(query)}`,
        { headers: getHeaders() },
      );

      const data = await readResponse(response);

      setPersons(data.persons || []);
      setSearched(true);
    } catch (err) {
      setError(err.message || "Unable to search persons.");
      setPersons([]);
      setSearched(false);
    } finally {
      setLoading(false);
    }
  };

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
      region: person.region || "",
      zone: person.zone || "",
      city: person.city || "",
      woreda: person.woreda || "",
      kebele: person.kebele || "",
      got: person.got || "",
    });

    setError("");
    setSuccess("");
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;

    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  };

  const validateForm = () => {
    const requiredFields = [
      ["first_name", "First name"],
      ["middle_name", "Middle name"],
      ["last_name", "Last name"],
      ["region", "Region"],
      ["zone", "Zone"],
      ["woreda", "Woreda"],
      ["kebele", "Kebele"],
    ];

    for (const [field, label] of requiredFields) {
      if (!form[field].trim()) {
        return `${label} is required.`;
      }
    }

    for (const field of ["region", "zone", "city", "woreda", "kebele", "got"]) {
      if (form[field].trim().length > 100) {
        return `${field} must not exceed 100 characters.`;
      }
    }

    if (!["Male", "Female"].includes(form.gender)) {
      return "Please select a valid gender.";
    }

    if (form.phone.trim() && !/^(09|07)\d{8}$/.test(form.phone.trim())) {
      return "Phone number must contain 10 digits and start with 09 or 07.";
    }

    if (form.date_of_birth) {
      const birthDate = new Date(`${form.date_of_birth}T00:00:00`);
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      if (Number.isNaN(birthDate.getTime()) || birthDate > today) {
        return "Date of birth cannot be in the future.";
      }
    }

    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = {
      first_name: form.first_name.trim(),
      middle_name: form.middle_name.trim(),
      last_name: form.last_name.trim(),
      gender: form.gender,
      date_of_birth: form.date_of_birth || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,

      region: form.region.trim(),
      zone: form.zone.trim(),
      city: form.city.trim() || null,
      woreda: form.woreda.trim(),
      kebele: form.kebele.trim(),
      got: form.got.trim() || null,
    };

    setSaving(true);

    try {
      const isEditing = editingId !== null;

      const response = await fetch(
        isEditing ? `${API_URL}/persons/${editingId}` : `${API_URL}/persons`,
        {
          method: isEditing ? "PUT" : "POST",
          headers: getHeaders(),
          body: JSON.stringify(payload),
        },
      );

      const data = await readResponse(response);

      setShowForm(false);
      setEditingId(null);
      setForm({ ...emptyForm });

      setSuccess(
        data.message ||
          (isEditing
            ? "Person updated successfully."
            : "Person registered successfully."),
      );

      // Refresh only the current search results.
      if (search.trim()) {
        await searchAgain();
      } else {
        setPersons([]);
        setSearched(false);
      }
    } catch (err) {
      setError(err.message || "Unable to save person.");
    } finally {
      setSaving(false);
    }
  };

  const searchAgain = async () => {
    const query = search.trim();
    if (!query) return;

    setLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/persons/search?query=${encodeURIComponent(query)}`,
        { headers: getHeaders() },
      );

      const data = await readResponse(response);
      setPersons(data.persons || []);
      setSearched(true);
    } catch (err) {
      setError(err.message || "Unable to refresh search results.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (person) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${person.first_name} ${person.last_name}?`,
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");
    setDeletingId(person.person_id);

    try {
      const response = await fetch(`${API_URL}/persons/${person.person_id}`, {
        method: "DELETE",
        headers: getHeaders(),
      });

      const data = await readResponse(response);

      setSuccess(data.message || "Person deleted successfully.");

      await searchAgain();
    } catch (err) {
      setError(err.message || "Unable to delete person.");
    } finally {
      setDeletingId(null);
    }
  };

  const clearSearch = () => {
    setSearch("");
    setPersons([]);
    setSearched(false);
    setError("");
    setSuccess("");
  };

  return (
    <main className="persons-page">
      <header className="persons-header">
        <div className="persons-heading">
          <span className="persons-eyebrow">RECORD MANAGEMENT</span>
          <h1>Persons Management</h1>
          <p>Register and manage personal and location information.</p>
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
          <AlertCircle size={19} />
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}

      {success && (
        <div className="persons-alert persons-alert-success" role="status">
          <CheckCircle size={19} />
          <span>{success}</span>
          <button type="button" onClick={() => setSuccess("")}>
            <X size={17} />
          </button>
        </div>
      )}

      <section className="persons-search-card">
        <div className="persons-search-heading">
          <div className="persons-search-icon">
            <Search size={22} />
          </div>
          <div>
            <h2>Find a Person</h2>
            <p>Search using Person ID or person's name.</p>
          </div>
        </div>

        <form className="persons-search-form" onSubmit={handleSearch}>
          <div className="persons-search-input">
            <Search size={19} />
            <input
              type="search"
              placeholder="Enter Person ID or name..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                type="button"
                className="persons-clear-search"
                onClick={clearSearch}
                aria-label="Clear search"
              >
                <X size={17} />
              </button>
            )}
          </div>

          <button
            className="persons-primary-btn persons-search-btn"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <RefreshCw size={17} className="persons-spinner" />
            ) : (
              <Search size={17} />
            )}
            Search
          </button>
        </form>
      </section>

      <section className="persons-list-card">
        <div className="persons-list-header">
          <div>
            <h2>Search Results</h2>
            <p>
              {searched
                ? `${persons.length} record(s) found`
                : "Search for a person to view records."}
            </p>
          </div>

          {searched && (
            <div className="persons-result-count">
              <Users size={17} />
              {persons.length}
            </div>
          )}
        </div>

        {loading ? (
          <div className="persons-state">
            <RefreshCw className="persons-spinner" size={27} />
            <p>Searching persons...</p>
          </div>
        ) : !searched ? (
          <div className="persons-state">
            <Search size={35} />
            <h3>Search for a person</h3>
            <p>Enter a Person ID or name above to see matching records.</p>
          </div>
        ) : persons.length === 0 ? (
          <div className="persons-state">
            <Users size={35} />
            <h3>No persons found</h3>
            <p>Try another ID or name.</p>
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
                {persons.map((person) => (
                  <tr key={person.person_id}>
                    <td className="persons-id-cell">#{person.person_id}</td>

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
                      <span>
                        {[
                          person.region,
                          person.zone,
                          person.city,
                          person.woreda,
                          person.kebele,
                          person.got,
                        ]
                          .filter(Boolean)
                          .join(", ") || "Not assigned"}
                      </span>
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
                          disabled={deletingId === person.person_id}
                          onClick={() => handleDelete(person)}
                        >
                          {deletingId === person.person_id ? (
                            <RefreshCw size={16} className="persons-spinner" />
                          ) : (
                            <Trash2 size={16} />
                          )}
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
        <div
          className="persons-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              closeForm();
            }
          }}
        >
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
                <p>Complete personal and location information.</p>
              </div>

              <button
                className="persons-close-btn"
                type="button"
                onClick={closeForm}
                disabled={saving}
                aria-label="Close form"
              >
                <X size={21} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="persons-form-section-title">
                <UserRound size={18} />
                <div>
                  <h3>Personal Information</h3>
                  <p>Enter the person's basic details.</p>
                </div>
              </div>

              <div className="persons-form-grid">
                <label>
                  First Name <span className="persons-required">*</span>
                  <input
                    name="first_name"
                    value={form.first_name}
                    onChange={updateField}
                    maxLength={100}
                    required
                  />
                </label>

                <label>
                  Middle Name <span className="persons-required">*</span>
                  <input
                    name="middle_name"
                    value={form.middle_name}
                    onChange={updateField}
                    maxLength={100}
                    required
                  />
                </label>

                <label>
                  Last Name <span className="persons-required">*</span>
                  <input
                    name="last_name"
                    value={form.last_name}
                    onChange={updateField}
                    maxLength={100}
                    required
                  />
                </label>

                <label>
                  Gender <span className="persons-required">*</span>
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
                    placeholder="Additional address details"
                  />
                </label>
              </div>

              <div className="persons-form-section-title persons-location-section-title">
                <MapPinned size={19} />
                <div>
                  <h3>Location Information</h3>
                  <p>Enter where this person lives.</p>
                </div>
              </div>

              <div className="persons-form-grid">
                <label>
                  Region <span className="persons-required">*</span>
                  <input
                    name="region"
                    value={form.region}
                    onChange={updateField}
                    maxLength={100}
                    required
                  />
                </label>

                <label>
                  Zone <span className="persons-required">*</span>
                  <input
                    name="zone"
                    value={form.zone}
                    onChange={updateField}
                    maxLength={100}
                    required
                  />
                </label>

                <label>
                  City
                  <input
                    name="city"
                    value={form.city}
                    onChange={updateField}
                    maxLength={100}
                  />
                </label>

                <label>
                  Woreda <span className="persons-required">*</span>
                  <input
                    name="woreda"
                    value={form.woreda}
                    onChange={updateField}
                    maxLength={100}
                    required
                  />
                </label>

                <label>
                  Kebele <span className="persons-required">*</span>
                  <input
                    name="kebele"
                    value={form.kebele}
                    onChange={updateField}
                    maxLength={100}
                    required
                  />
                </label>

                <label>
                  Got
                  <input
                    name="got"
                    value={form.got}
                    onChange={updateField}
                    maxLength={100}
                  />
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
                  {saving ? (
                    <>
                      <RefreshCw size={16} className="persons-spinner" />
                      Saving...
                    </>
                  ) : editingId !== null ? (
                    <>
                      <Pencil size={16} />
                      Save Changes
                    </>
                  ) : (
                    <>
                      <UserPlus size={17} />
                      Register Person
                    </>
                  )}
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
