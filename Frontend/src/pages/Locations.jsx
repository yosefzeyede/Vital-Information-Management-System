import { useCallback, useEffect, useState } from "react";
import {
  MapPin,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  RefreshCw,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import "../pagecss/Locations.css";

const API_URL = "http://localhost:4000/api";

const emptyForm = {
  region: "",
  zone: "",
  city: "",
  woreda: "",
  kebele: "",
  got: "",
};

function Locations() {
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Get the JWT token from localStorage.
  const getHeaders = () => {
    const token = localStorage.getItem("token");

    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  // Load locations from the database.
  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");

      if (!token) {
        throw new Error("Please log in again to continue.");
      }

      const response = await fetch(`${API_URL}/locations`, {
        method: "GET",
        headers: getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to retrieve locations.");
      }

      setLocations(data.locations || []);
    } catch (err) {
      setError(err.message || "Unable to load locations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // Update form fields.
  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // Clear form and messages.
  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
    setSuccess("");
  };

  // Create a new location or update an existing one.
  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    const requiredFields = [
      ["region", "Region"],
      ["zone", "Zone"],
      ["woreda", "Woreda"],
      ["kebele", "Kebele"],
    ];

    for (const [field, label] of requiredFields) {
      if (!form[field].trim()) {
        setError(`${label} is required.`);
        return;
      }
    }

    const textFields = [
      ["region", "Region"],
      ["zone", "Zone"],
      ["city", "City"],
      ["woreda", "Woreda"],
      ["kebele", "Kebele"],
      ["got", "Got"],
    ];

    for (const [field, label] of textFields) {
      if (form[field].trim().length > 100) {
        setError(`${label} must not exceed 100 characters.`);
        return;
      }
    }

    const payload = {
      region: form.region.trim(),
      zone: form.zone.trim(),
      city: form.city.trim(),
      woreda: form.woreda.trim(),
      kebele: form.kebele.trim(),
      got: form.got.trim(),
    };

    const isEditing = editingId !== null;
    const endpoint = isEditing
      ? `${API_URL}/locations/${editingId}`
      : `${API_URL}/locations`;

    setSaving(true);

    try {
      const response = await fetch(endpoint, {
        method: isEditing ? "PUT" : "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        const validationMessage = Array.isArray(data.errors)
          ? data.errors.join(" ")
          : data.message;

        throw new Error(
          validationMessage ||
            `Failed to ${isEditing ? "update" : "create"} location.`,
        );
      }

      setSuccess(
        data.message ||
          `Location ${isEditing ? "updated" : "created"} successfully.`,
      );

      resetForm();
      await fetchLocations();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  // Fill the form with the selected location.
  const handleEdit = (location) => {
    setEditingId(location.location_id);

    setForm({
      region: location.region || "",
      zone: location.zone || "",
      city: location.city || "",
      woreda: location.woreda || "",
      kebele: location.kebele || "",
      got: location.got || "",
    });

    setError("");
    setSuccess("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // Delete a location.
  const handleDelete = async (location) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete location #${location.location_id}?\n\n` +
        `${location.region}, ${location.zone}, ${location.woreda}`,
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");
    setDeletingId(location.location_id);

    try {
      const response = await fetch(
        `${API_URL}/locations/${location.location_id}`,
        {
          method: "DELETE",
          headers: getHeaders(),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to delete location.");
      }

      setSuccess(data.message || "Location deleted successfully.");

      if (editingId === location.location_id) {
        resetForm();
      }

      await fetchLocations();
    } catch (err) {
      setError(err.message || "Unable to delete location.");
    } finally {
      setDeletingId(null);
    }
  };

  // Search locations by any location field.
  const filteredLocations = locations.filter((location) => {
    const searchableText = [
      location.location_id,
      location.region,
      location.zone,
      location.city,
      location.woreda,
      location.kebele,
      location.got,
    ]
      .map((value) => String(value ?? ""))
      .join(" ")
      .toLowerCase();

    return searchableText.includes(searchTerm.trim().toLowerCase());
  });

  return (
    <div className="locations-page">
      <header className="locations-header">
        <div className="locations-heading">
          <div className="locations-heading-icon">
            <MapPin size={25} />
          </div>

          <div>
            <h1>Locations Management</h1>
            <p>Manage regions, zones, woredas, kebeles and local areas.</p>
          </div>
        </div>

        <button
          type="button"
          className="locations-refresh-btn"
          onClick={fetchLocations}
          disabled={loading}
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </header>

      {/* Error message */}
      {error && (
        <div className="locations-alert locations-alert-error" role="alert">
          <AlertCircle size={19} />
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

      {/* Success message */}
      {success && (
        <div className="locations-alert locations-alert-success" role="status">
          <CheckCircle size={19} />
          <span>{success}</span>
          <button
            type="button"
            aria-label="Dismiss success message"
            onClick={() => setSuccess("")}
          >
            <X size={17} />
          </button>
        </div>
      )}

      {/* Create and update form */}
      <section className="locations-card">
        <div className="locations-card-heading">
          <div>
            <h2>{editingId !== null ? "Edit Location" : "Add New Location"}</h2>
            <p>
              {editingId !== null
                ? `Editing location #${editingId}`
                : "Enter the location information below."}
            </p>
          </div>

          {editingId !== null && (
            <button
              type="button"
              className="locations-cancel-btn"
              onClick={resetForm}
            >
              <X size={17} />
              Cancel
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="locations-form-grid">
            <div className="locations-field">
              <label htmlFor="region">
                Region <span>*</span>
              </label>
              <input
                id="region"
                name="region"
                type="text"
                value={form.region}
                onChange={handleChange}
                maxLength={100}
                placeholder="Enter region"
                required
              />
            </div>

            <div className="locations-field">
              <label htmlFor="zone">
                Zone <span>*</span>
              </label>
              <input
                id="zone"
                name="zone"
                type="text"
                value={form.zone}
                onChange={handleChange}
                maxLength={100}
                placeholder="Enter zone"
                required
              />
            </div>

            <div className="locations-field">
              <label htmlFor="city">City (Optional)</label>
              <input
                id="city"
                name="city"
                type="text"
                value={form.city}
                onChange={handleChange}
                maxLength={100}
                placeholder="Enter city"
              />
            </div>

            <div className="locations-field">
              <label htmlFor="woreda">
                Woreda <span>*</span>
              </label>
              <input
                id="woreda"
                name="woreda"
                type="text"
                value={form.woreda}
                onChange={handleChange}
                maxLength={100}
                placeholder="Enter woreda"
                required
              />
            </div>

            <div className="locations-field">
              <label htmlFor="kebele">
                Kebele <span>*</span>
              </label>
              <input
                id="kebele"
                name="kebele"
                type="text"
                value={form.kebele}
                onChange={handleChange}
                maxLength={100}
                placeholder="Enter kebele"
                required
              />
            </div>

            <div className="locations-field">
              <label htmlFor="got">Got (Optional)</label>
              <input
                id="got"
                name="got"
                type="text"
                value={form.got}
                onChange={handleChange}
                maxLength={100}
                placeholder="Enter got"
              />
            </div>
          </div>

          <div className="locations-form-actions">
            <button
              type="button"
              className="locations-clear-btn"
              onClick={resetForm}
              disabled={saving}
            >
              Clear
            </button>

            <button
              type="submit"
              className="locations-submit-btn"
              disabled={saving}
            >
              {editingId !== null ? <Pencil size={17} /> : <Plus size={18} />}
              {saving
                ? "Saving..."
                : editingId !== null
                  ? "Update Location"
                  : "Add Location"}
            </button>
          </div>
        </form>
      </section>

      {/* Locations table */}
      <section className="locations-card locations-table-card">
        <div className="locations-table-heading">
          <div>
            <h2>Registered Locations</h2>
            <p>
              {filteredLocations.length} of {locations.length} locations
            </p>
          </div>

          <div className="locations-search">
            <Search size={18} />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search locations..."
              aria-label="Search locations"
            />
          </div>
        </div>

        {loading ? (
          <div className="locations-state">
            <RefreshCw size={22} className="locations-spinner" />
            <p>Loading locations...</p>
          </div>
        ) : filteredLocations.length === 0 ? (
          <div className="locations-state">
            <MapPin size={32} />
            <h3>
              {searchTerm ? "No matching locations" : "No locations found"}
            </h3>
            <p>
              {searchTerm
                ? "Try another search term."
                : "Add a new location using the form above."}
            </p>
          </div>
        ) : (
          <div className="locations-table-wrapper">
            <table className="locations-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Region</th>
                  <th>Zone</th>
                  <th>City</th>
                  <th>Woreda</th>
                  <th>Kebele</th>
                  <th>Got</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredLocations.map((location) => (
                  <tr key={location.location_id}>
                    <td>#{location.location_id}</td>
                    <td>{location.region}</td>
                    <td>{location.zone}</td>
                    <td>{location.city || "—"}</td>
                    <td>{location.woreda}</td>
                    <td>{location.kebele}</td>
                    <td>{location.got || "—"}</td>
                    <td>
                      <div className="locations-row-actions">
                        <button
                          type="button"
                          className="locations-edit-btn"
                          title="Edit location"
                          aria-label={`Edit location ${location.location_id}`}
                          onClick={() => handleEdit(location)}
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          className="locations-delete-btn"
                          title="Delete location"
                          aria-label={`Delete location ${location.location_id}`}
                          onClick={() => handleDelete(location)}
                          disabled={deletingId === location.location_id}
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
    </div>
  );
}

export default Locations;
