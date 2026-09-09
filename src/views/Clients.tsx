import { useEffect, useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useNavigate } from "../lib/router";
import { api } from "../services/api";
import Icon from "../components/Icon";
import "../styles/pages.css";

function toSlug(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface Manager {
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
}

interface Client {
  id: string;
  name: string;
  managers: Manager[];
  requirement_count: number;
  requirement_ids: string[];
  created_at: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  is_super_admin: boolean;
  is_active: boolean;
}

export default function Clients() {
  useDocumentTitle("Clients");
  const navigate = useNavigate();

  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClientName, setNewClientName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);

  // Per-client assign state: clientId → selected userId
  const [assignSelections, setAssignSelections] = useState<
    Record<string, string>
  >({});
  const [assignLoading, setAssignLoading] = useState<string | null>(null);
  const [assignMsg, setAssignMsg] = useState<
    Record<string, { text: string; ok: boolean }>
  >({});

  const [deletingClient, setDeletingClient] = useState<string | null>(null);
  const [removingManager, setRemovingManager] = useState<string | null>(null);

  const fetchClients = async () => {
    try {
      const data = await api.get("/clients");
      setClients(data);
    } catch {
      /* non-fatal */
    }
  };

  useEffect(() => {
    Promise.all([
      api.get("/clients").catch(() => []),
      api.get("/users").catch(() => []),
    ]).then(([clientData, userData]) => {
      setClients(clientData);
      setUsers(
        (userData as User[]).filter((u) => u.is_active && !u.is_super_admin),
      );
      setLoading(false);
    });
  }, []);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newClientName.trim();
    if (!name) return;
    setCreating(true);
    setCreateMsg(null);
    try {
      await api.post("/clients", { name });
      setNewClientName("");
      setCreateMsg({ text: `Client "${name}" created.`, ok: true });
      await fetchClients();
    } catch (err: any) {
      setCreateMsg({
        text: err.detail || err.message || "Failed to create client",
        ok: false,
      });
    } finally {
      setCreating(false);
    }
  };

  const handleAssignManager = async (clientId: string) => {
    const userId = assignSelections[clientId];
    if (!userId) return;
    setAssignLoading(clientId);
    setAssignMsg((m) => ({ ...m, [clientId]: { text: "", ok: true } }));
    try {
      await api.post(`/clients/${clientId}/managers`, { user_id: userId });
      setAssignSelections((s) => ({ ...s, [clientId]: "" }));
      setAssignMsg((m) => ({
        ...m,
        [clientId]: { text: "Manager assigned.", ok: true },
      }));
      await fetchClients();
    } catch (err: any) {
      setAssignMsg((m) => ({
        ...m,
        [clientId]: {
          text: err.detail || err.message || "Failed to assign",
          ok: false,
        },
      }));
    } finally {
      setAssignLoading(null);
    }
  };

  const handleRemoveManager = async (
    clientId: string,
    userId: string,
    userName: string,
    clientName: string,
  ) => {
    if (!confirm(`Remove ${userName} from ${clientName}?`)) return;
    setRemovingManager(`${clientId}-${userId}`);
    try {
      await api.delete(`/clients/${clientId}/managers/${userId}`);
      await fetchClients();
    } catch (err: any) {
      alert(err.detail || err.message || "Failed to remove manager");
    } finally {
      setRemovingManager(null);
    }
  };

  const handleDeleteClient = async (client: Client) => {
    if (!confirm(`Delete client "${client.name}"? This cannot be undone.`))
      return;
    setDeletingClient(client.id);
    try {
      await api.delete(`/clients/${client.id}`);
      setClients((c) => c.filter((x) => x.id !== client.id));
    } catch (err: any) {
      alert(err.detail || err.message || "Failed to delete client");
    } finally {
      setDeletingClient(null);
    }
  };

  if (loading) {
    return <div className="page-loading">Loading clients…</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Clients</h1>
        <p className="page-subtitle">
          Manage client companies and their assigned managers.
        </p>
      </div>

      {/* Create client */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius)",
          padding: "1.25rem",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
          Add new client
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            marginBottom: "0.75rem",
          }}
        >
          Creates a client company. Existing requirements with the same name
          will be linked automatically.
        </div>
        <form
          onSubmit={handleCreateClient}
          style={{
            display: "flex",
            gap: "0.75rem",
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div
            className="form-group"
            style={{ flex: "1 1 280px", marginBottom: 0 }}
          >
            <label style={{ fontSize: 13 }}>Client / Company name</label>
            <input
              className="form-input"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="e.g. Bridgewest"
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={creating}
            style={{ height: 38 }}
          >
            {creating ? "Creating…" : "Create Client"}
          </button>
        </form>
        {createMsg && (
          <div
            style={{
              marginTop: "0.6rem",
              fontSize: 13,
              color: createMsg.ok
                ? "var(--success, #16a34a)"
                : "var(--danger, #dc2626)",
            }}
          >
            {createMsg.text}
          </div>
        )}
      </div>

      {/* Client list */}
      {clients.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            color: "var(--text-muted)",
            fontSize: 14,
          }}
        >
          No clients yet. Create the first one above.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {clients.map((client) => {
            const assignedIds = new Set(client.managers.map((m) => m.user_id));
            const availableUsers = users.filter((u) => !assignedIds.has(u.id));
            const msg = assignMsg[client.id];

            return (
              <div
                key={client.id}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius)",
                  padding: "1.25rem",
                }}
              >
                {/* Header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "0.75rem",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>
                      {client.name}
                    </span>
                    <span
                      style={{
                        marginLeft: "0.75rem",
                        fontSize: 12,
                        color: "var(--text-muted)",
                        background: "var(--bg-secondary)",
                        borderRadius: 4,
                        padding: "2px 7px",
                      }}
                    >
                      {client.requirement_count} requirement
                      {client.requirement_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      alignItems: "center",
                    }}
                  >
                    <button
                      onClick={() =>
                        navigate(
                          `/requirements/new?client=${encodeURIComponent(client.name)}`,
                        )
                      }
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: 12 }}
                      title="Create requirement for this client"
                    >
                      + Create Requirement
                    </button>
                    <button
                      onClick={() =>
                        navigate(`/dashboard/${toSlug(client.name)}`)
                      }
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 12 }}
                      title="View client on dashboard"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleDeleteClient(client)}
                      disabled={deletingClient === client.id}
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--danger, #dc2626)", fontSize: 12 }}
                      title="Delete client"
                    >
                      <Icon name="trash" size={13} />
                      {deletingClient === client.id ? " Deleting…" : " Delete"}
                    </button>
                  </div>
                </div>

                {/* Assigned managers */}
                <div style={{ marginBottom: "0.75rem" }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      fontWeight: 500,
                      marginBottom: "0.4rem",
                    }}
                  >
                    Assigned Managers
                  </div>
                  {client.managers.length === 0 ? (
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      No managers assigned yet.
                    </span>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                      }}
                    >
                      {client.managers.map((m) => (
                        <span
                          key={m.user_id}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.4rem",
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: 6,
                            padding: "3px 8px",
                            fontSize: 13,
                          }}
                        >
                          <span style={{ fontWeight: 500 }}>{m.user_name}</span>
                          <span
                            style={{ fontSize: 11, color: "var(--text-muted)" }}
                          >
                            {m.user_email}
                          </span>
                          <button
                            onClick={() =>
                              handleRemoveManager(
                                client.id,
                                m.user_id,
                                m.user_name,
                                client.name,
                              )
                            }
                            disabled={
                              removingManager === `${client.id}-${m.user_id}`
                            }
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "var(--danger, #dc2626)",
                              fontWeight: 700,
                              padding: "0 2px",
                              lineHeight: 1,
                            }}
                            title="Remove manager"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Assign new manager */}
                {availableUsers.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <select
                      className="form-input"
                      style={{
                        flex: "1 1 200px",
                        maxWidth: 300,
                        height: 34,
                        padding: "0 8px",
                        fontSize: 13,
                      }}
                      value={assignSelections[client.id] || ""}
                      onChange={(e) =>
                        setAssignSelections((s) => ({
                          ...s,
                          [client.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">- assign manager -</option>
                      {availableUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleAssignManager(client.id)}
                      disabled={
                        !assignSelections[client.id] ||
                        assignLoading === client.id
                      }
                      style={{ height: 34 }}
                    >
                      {assignLoading === client.id ? "Assigning…" : "Assign"}
                    </button>
                  </div>
                )}
                {msg?.text && (
                  <div
                    style={{
                      marginTop: "0.4rem",
                      fontSize: 12,
                      color: msg.ok
                        ? "var(--success, #16a34a)"
                        : "var(--danger, #dc2626)",
                    }}
                  >
                    {msg.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
