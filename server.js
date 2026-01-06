const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const session = require("express-session");
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require("bcrypt");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const db = require("./utils/db");

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// expose utils as /assets so admin can drop `logog.png` into utils/
app.use('/assets', express.static(path.join(__dirname, 'utils')));

app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: './db' }),
    secret: process.env.SESSION_SECRET || "change_this_secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
  })
);

app.set("io", io);

// Ensure default admin exists (username: admin, password: password)
db.get("SELECT COUNT(*) as c FROM admin", (err, row) => {
  if (err) return console.error(err);
  if (!row || row.c === 0) {
    const defaultPass = process.env.ADMIN_PASSWORD || "password";
    bcrypt.hash(defaultPass, 10, (err, hash) => {
      if (err) return console.error(err);
      db.run(
        "INSERT OR IGNORE INTO admin (username, password_hash) VALUES (?, ?)",
        ["admin", hash],
        () => console.log("Default admin created (username: admin). Change the password ASAP.")
      );
    });
  }
});

// Serve admin page or login depending on session
app.get("/admin", (req, res) => {
  if (req.session && req.session.admin) {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
  } else {
    res.sendFile(path.join(__dirname, "public", "admin_login.html"));
  }
});

// Serve checkin page for GET (so QR links open the checkin UI)
app.get('/checkin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkin.html'));
});

app.use("/checkin", require("./routes/checkin"));
app.use("/admin", require("./routes/admin"));

// Debug: list registered routes
app.get('/_routes', (req,res)=>{
  const routes = [];
  app._router.stack.forEach(mw => {
    if (mw.route && mw.route.path) routes.push(mw.route.path);
    else if (mw.name === 'router' && mw.handle && mw.handle.stack) {
      mw.handle.stack.forEach(r => {
        if (r.route && r.route.path) routes.push((mw.regexp && mw.regexp.source) + ' -> ' + r.route.path);
      });
    }
  });
  res.json(routes);
});

io.on("connection", (socket) => {
  console.log("Socket connected");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

