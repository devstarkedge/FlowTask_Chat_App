function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function normalizePresence(socketPresence, awarenessUsers) {
  const users = new Map();

  socketPresence.forEach((user) => {
    users.set(user.userId || user.id, {
      id: user.userId || user.id,
      name: user.name,
      avatar: user.avatar,
      color: user.color,
      activity: user.activity || "viewing canvas",
    });
  });

  awarenessUsers.forEach((user) => {
    users.set(user.id, {
      ...users.get(user.id),
      ...user,
    });
  });

  return Array.from(users.values()).filter((user) => user.id);
}

export default function PresenceBar({ socketPresence = [], awarenessUsers = [], status }) {
  const allUsers = normalizePresence(socketPresence, awarenessUsers);
  const users = allUsers.slice(0, 6);
  const overflow = Math.max(0, allUsers.length - users.length);

  const showStatus = users.length === 0;

  return (
    <div className="canvas-presence-bar" aria-label="Canvas presence">
      {showStatus && <span className={`canvas-collab-status is-${status}`}>{status || "idle"}</span>}
      <div className="canvas-avatar-stack">
        {users.map((user) => (
          <span
            key={user.id}
            className="canvas-presence-avatar"
            title={`${user.name} ${user.activity || ""}`.trim()}
            style={{ "--presence-color": user.color || "#4e7cff" }}
          >
            {user.avatar ? <img src={user.avatar} alt="" /> : initials(user.name)}
          </span>
        ))}
        {overflow > 0 && <span className="canvas-presence-avatar is-overflow">+{overflow}</span>}
      </div>
      {users[0] && (
        <span className="canvas-presence-copy">
          {initials(users[0].name)} {users[0].activity || "viewing canvas"}
        </span>
      )}
    </div>
  );
}
