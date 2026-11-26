(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const cfg = window.APP_CONFIG || {};
  const LOCALE = "fr-FR";

  if (cfg.shopName) document.title = cfg.shopName + " — Commandes";

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
    $("setupView").hidden = false;
    return;
  }
  // Accepte une adresse collée avec des parties en trop (ex. ".../rest/v1/") — garde seulement https://xxxx.supabase.co
  let baseUrl = String(cfg.supabaseUrl).trim();
  try { baseUrl = new URL(baseUrl).origin; } catch (e) { /* laisser tel quel */ }
  const sb = window.supabase.createClient(baseUrl, String(cfg.supabaseAnonKey).trim());

  const S = {
    user: null, role: "employee", name: "", staff: {},
    today: todayStr(), day: todayStr(),
    orders: [], menu: [], currency: "",
    cart: [], filter: "all", menuDraft: null, channel: null
  };
  const isOwner = () => S.role === "owner";

  /* ---------- outils ---------- */
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function shiftDay(str, n) {
    const [y, m, d] = str.split("-").map(Number);
    const dt = new Date(y, m - 1, d + n);
    return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
  }
  function niceDay(str) {
    const [y, m, d] = str.split("-").map(Number);
    const s = new Date(y, m - 1, d).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function toCents(v) {
    const s = String(v).replace(/\s/g, "").replace(",", ".");
    if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
    return Math.round(parseFloat(s) * 100);
  }
  const numFmt = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function money(c) {
    const s = numFmt.format((c || 0) / 100);
    return S.currency ? s + " " + S.currency : s;
  }
  function plural(n, one, many) { return n + " " + (n <= 1 ? one : many); }
  function timeOf(ts) { return ts ? new Date(ts).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" }) : ""; }
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    for (const kid of kids) if (kid != null) e.append(kid);
    return e;
  }
  let toastT;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
  }
  function setStatus(msg, err) {
    const s = $("status"); s.textContent = msg || ""; s.hidden = !msg; s.classList.toggle("err", !!err);
  }
  function failed(error, what) {
    console.error(error);
    setStatus("Impossible de " + what + ". Vérifiez la connexion internet et réessayez." + (error && error.message ? " (" + error.message + ")" : ""), true);
  }

  /* ---------- connexion / déconnexion ---------- */
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("loginBtn").disabled = true; $("loginStatus").textContent = "Connexion…"; $("loginStatus").classList.remove("err");
    const { error } = await sb.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
    $("loginBtn").disabled = false;
    if (error) {
      const m = (error.message || "").toLowerCase();
      let msg;
      if (m.includes("invalid login")) msg = "E-mail ou mot de passe incorrect.";
      else if (m.includes("not confirmed")) msg = "Ce compte n'est pas encore confirmé. Demandez au responsable de le confirmer dans Supabase.";
      else if (m.includes("fetch") || m.includes("network")) msg = "Impossible de joindre la base de données. Vérifiez la connexion internet.";
      else if (m.includes("api key") || m.includes("apikey")) msg = "La clé dans config.js n'est pas acceptée. Collez à nouveau la clé « anon public ».";
      else msg = "Connexion impossible : " + error.message;
      $("loginStatus").textContent = msg; $("loginStatus").classList.add("err");
    } else { $("loginStatus").textContent = ""; $("password").value = ""; }
  });
  $("signOut").addEventListener("click", () => sb.auth.signOut());

  let started = false;
  sb.auth.onAuthStateChange((_event, session) => {
    const user = session ? session.user : null;
    if (user && (!S.user || S.user.id !== user.id)) { S.user = user; setTimeout(start, 0); }
    else if (!user) stop();
  });

  function stop() {
    S.user = null; started = false;
    if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
    S.orders = []; S.cart = []; S.staff = {};
    $("appView").hidden = true; $("loginView").hidden = false;
  }

  async function start() {
    if (started) return; started = true;
    $("loginView").hidden = true; $("appView").hidden = false;
    setStatus("Chargement…");
    const { data: prof, error } = await sb.from("profiles").select("name, role").eq("id", S.user.id).maybeSingle();
    if (error) { failed(error, "charger votre profil"); return; }
    S.role = prof ? prof.role : "employee";
    S.name = (prof && prof.name) || S.user.email;
    $("whoName").textContent = S.name;
    $("whoRole").textContent = isOwner() ? "Gérant·e" : "Employé·e";
    $("roleLabel").textContent = isOwner() ? "Espace gérant" : "Comptoir";
    document.querySelectorAll(".owner-only").forEach((n) => { n.hidden = !isOwner(); });
    $("dayNav").hidden = !isOwner();
    S.today = todayStr(); S.day = S.today; $("dayPick").value = S.day;

    if (isOwner()) {
      const { data: staff } = await sb.from("profiles").select("id, name");
      S.staff = {}; (staff || []).forEach((p) => { S.staff[p.id] = p.name; });
    }
    await Promise.all([loadMenu(), loadOrders()]);
    setStatus("");
    renderAll();
    subscribe();
  }

  /* ---------- données ---------- */
  async function loadMenu() {
    const [m, s] = await Promise.all([
      sb.from("menu_items").select("id, name, price_cents, sort").order("sort").order("name"),
      sb.from("settings").select("currency").eq("id", 1).maybeSingle()
    ]);
    if (m.error) { failed(m.error, "charger le menu"); return; }
    S.menu = m.data || [];
    S.currency = (s.data && s.data.currency) || "";
    if (document.activeElement !== $("currency")) $("currency").value = S.currency;
    if (!$("menuPanel").open) S.menuDraft = null;
  }
  let loadSeq = 0;
  async function loadOrders() {
    const seq = ++loadSeq, day = S.day;
    const { data, error } = await sb.from("orders").select("*").eq("day", day).order("created_at", { ascending: false });
    if (seq !== loadSeq) return;
    if (error) { failed(error, "charger les commandes"); return; }
    S.orders = data || [];
  }
  let reloadT;
  function subscribe() {
    if (S.channel) sb.removeChannel(S.channel);
    S.channel = sb.channel("shop")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        clearTimeout(reloadT); reloadT = setTimeout(async () => { await loadOrders(); renderOrders(); renderSummary(); }, 300);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, async () => { await loadMenu(); renderAll(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, async () => { await loadMenu(); renderAll(); })
      .subscribe();
  }
  // Passe au jour suivant à minuit, et se met à jour quand l'onglet revient au premier plan.
  setInterval(() => {
    const t = todayStr();
    if (t !== S.today && S.user) { const wasToday = S.day === S.today; S.today = t; if (wasToday || !isOwner()) goDay(t); }
  }, 60000);
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && S.user && started) { await Promise.all([loadMenu(), loadOrders()]); renderAll(); }
  });

  /* ---------- nouvelle commande ---------- */
  function addToCart(name, cents) {
    const line = S.cart.find((l) => l.name === name && l.cents === cents);
    if (line) line.qty++; else S.cart.push({ name, cents, qty: 1 });
    renderCart();
  }
  const cartTotal = () => S.cart.reduce((a, l) => a + l.cents * l.qty, 0);

  function renderMenu() {
    const g = $("menuGrid"); g.replaceChildren();
    if (!S.menu.length) {
      g.append(el("p", { class: "empty", text: isOwner()
        ? "Pas encore de menu. Ajoutez vos boissons et leurs prix dans « Menu & prix » en bas de page, ou saisissez un article ici."
        : "Pas encore de menu. Demandez au gérant de l'ajouter, ou saisissez les articles ici." }));
      return;
    }
    for (const it of S.menu) {
      g.append(el("button", { class: "menu-btn", type: "button", onclick: () => addToCart(it.name, it.price_cents) },
        el("b", { text: it.name }), el("span", { class: "num", text: money(it.price_cents) })));
    }
  }
  function renderCart() {
    const c = $("cart"); c.replaceChildren();
    if (!S.cart.length) c.append(el("p", { class: "empty", text: "Touchez un article du menu pour commencer la commande." }));
    else {
      S.cart.forEach((l, i) => {
        c.append(el("div", { class: "cart-line" },
          el("span", { class: "name", text: l.name }),
          el("span", { class: "qty" },
            el("button", { type: "button", "aria-label": "Un de moins : " + l.name, text: "−", onclick: () => { l.qty--; if (l.qty <= 0) S.cart.splice(i, 1); renderCart(); } }),
            el("span", { class: "num", text: String(l.qty) }),
            el("button", { type: "button", "aria-label": "Un de plus : " + l.name, text: "+", onclick: () => { l.qty++; renderCart(); } })),
          el("span", { class: "num", text: money(l.cents * l.qty) })));
      });
      c.append(el("div", { class: "cart-total" }, el("span", { text: "Total" }), el("span", { class: "num", text: money(cartTotal()) })));
    }
    $("submitOrder").disabled = !S.cart.length || submitting;
  }
  $("customForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("customName").value.trim();
    const cents = toCents($("customPrice").value);
    if (!name) { toast("Saisissez le nom de l'article"); return; }
    if (cents === null) { toast("Saisissez un prix, par ex. 3,50"); return; }
    addToCart(name, cents);
    $("customName").value = ""; $("customPrice").value = "";
  });

  let submitting = false;
  $("submitOrder").addEventListener("click", async () => {
    if (!S.cart.length || submitting) return;
    submitting = true; renderCart();
    const paid = $("paidNow").checked;
    const { data, error } = await sb.from("orders").insert({
      day: todayStr(),
      items: S.cart.map((l) => ({ name: l.name, qty: l.qty, cents: l.cents })),
      note: $("orderNote").value.trim().slice(0, 80),
      paid
    }).select("num").single();
    submitting = false;
    if (error) { failed(error, "enregistrer la commande"); renderCart(); return; }
    S.cart = []; $("orderNote").value = ""; $("paidNow").checked = false;
    renderCart(); setStatus("");
    toast("Commande n°" + data.num + " enregistrée" + (paid ? " (payée)" : ""));
    if (S.day === todayStr()) { await loadOrders(); renderOrders(); renderSummary(); }
  });

  /* ---------- liste des commandes ---------- */
  async function setPaid(o, paid) {
    const { error } = await sb.from("orders").update({ paid }).eq("id", o.id);
    if (error) { failed(error, "modifier la commande"); return; }
    toast("Commande n°" + o.num + (paid ? " marquée payée" : " marquée impayée"));
    await loadOrders(); renderOrders(); renderSummary();
  }
  function deleteButton(o) {
    let armed = false, t;
    const b = el("button", { class: "btn small ghost danger", type: "button", text: "Supprimer" });
    b.addEventListener("click", async () => {
      if (!armed) {
        armed = true; b.textContent = "Confirmer la suppression"; b.classList.add("armed");
        t = setTimeout(() => { armed = false; b.textContent = "Supprimer"; b.classList.remove("armed"); }, 4000);
        return;
      }
      clearTimeout(t);
      const { error } = await sb.from("orders").delete().eq("id", o.id);
      if (error) { failed(error, "supprimer la commande"); return; }
      toast("Commande n°" + o.num + " supprimée");
      await loadOrders(); renderOrders(); renderSummary();
    });
    return b;
  }
  function renderOrders() {
    $("ordersH").textContent = S.day === todayStr() ? "Commandes du jour" : "Commandes du " + niceDay(S.day).toLowerCase();
    const box = $("orders"); box.replaceChildren();
    const list = S.orders.filter((o) => S.filter === "all" || (S.filter === "paid" ? o.paid : !o.paid));
    if (!list.length) {
      const which = S.filter === "paid" ? "payée" : "impayée";
      box.append(el("p", { class: "empty", text: S.orders.length
        ? "Aucune commande " + which + " pour ce jour."
        : "Aucune commande enregistrée pour ce jour. Les commandes apparaissent ici, les plus récentes en premier." }));
      return;
    }
    for (const o of list) {
      const ul = el("ul");
      for (const it of o.items || []) ul.append(el("li", null, el("span", { text: it.qty + " × " + it.name }), el("span", { class: "num", text: money(it.cents * it.qty) })));
      const actions = el("div", { class: "actions" },
        o.paid
          ? el("button", { class: "btn small ghost", type: "button", text: "Marquer impayée", onclick: () => setPaid(o, false) })
          : el("button", { class: "btn small terra", type: "button", text: "Marquer payée", onclick: () => setPaid(o, true) }));
      if (isOwner()) actions.append(deleteButton(o));
      const meta = [timeOf(o.created_at), o.note, isOwner() && o.created_by ? "par " + (S.staff[o.created_by] || "ancien employé") : ""].filter(Boolean).join(" · ");
      box.append(el("article", { class: "ticket " + (o.paid ? "paid" : "unpaid") },
        el("div", { class: "ticket-head" },
          el("span", { class: "id", text: "n°" + o.num }),
          el("span", { class: "meta", text: meta }),
          el("span", { class: "pill " + (o.paid ? "paid" : "unpaid"), text: o.paid ? "PAYÉE " + timeOf(o.paid_at) : "IMPAYÉE" })),
        ul,
        el("div", { class: "ticket-foot" }, el("span", { class: "total-amt num", text: money(o.total_cents) }), actions)));
    }
  }

  /* ---------- gérant : résumé + clôture ---------- */
  function renderSummary() {
    const next = S.orders.reduce((m, o) => Math.max(m, o.num || 0), 0) + 1;
    $("nextNum").textContent = S.day === todayStr() ? "Commande n°" + next : "";
    $("pastDayNote").hidden = S.day === todayStr();
    if (!isOwner()) return;

    let paid = 0, due = 0, nPaid = 0, nDue = 0, items = 0;
    const byItem = new Map(), byStaff = new Map();
    for (const o of S.orders) {
      const t = o.total_cents || 0;
      if (o.paid) { paid += t; nPaid++; } else { due += t; nDue++; }
      const who = o.created_by ? (S.staff[o.created_by] || "ancien employé") : "inconnu";
      const s = byStaff.get(who) || { n: 0, cents: 0 }; s.n++; s.cents += t; byStaff.set(who, s);
      for (const it of o.items || []) {
        items += it.qty;
        const r = byItem.get(it.name) || { qty: 0, cents: 0 };
        r.qty += it.qty; r.cents += it.qty * it.cents; byItem.set(it.name, r);
      }
    }
    $("sumPaid").textContent = money(paid);
    $("sumDue").textContent = money(due);
    $("sumAll").textContent = money(paid + due);
    $("sumCount").textContent = String(S.orders.length);
    $("sumPaidN").textContent = plural(nPaid, "commande payée", "commandes payées");
    $("sumDueN").textContent = plural(nDue, "commande impayée", "commandes impayées");
    $("sumItems").textContent = plural(items, "article", "articles");

    const tb = $("itemsBody"); tb.replaceChildren();
    const rows = [...byItem.entries()].sort((a, b) => b[1].qty - a[1].qty);
    if (!rows.length) tb.append(el("tr", null, el("td", { colspan: "3", class: "empty", text: "Rien de vendu ce jour-là." })));
    for (const [name, r] of rows) tb.append(el("tr", null, el("td", { text: name }), el("td", { class: "r num", text: String(r.qty) }), el("td", { class: "r num", text: money(r.cents) })));
    $("itemsQty").textContent = String(items);
    $("itemsRev").textContent = money(paid + due);
    $("closePaid").textContent = money(paid);
    $("closeDue").textContent = money(due);
    $("closeAll").textContent = money(paid + due);
    $("closeDate").textContent = niceDay(S.day);
    const w = $("closeWarn");
    w.hidden = !nDue;
    w.textContent = nDue ? (nDue === 1 ? "1 commande est encore impayée" : nDue + " commandes sont encore impayées") + " (" + money(due) + ")." : "";

    const sb2 = $("byStaff"); sb2.replaceChildren();
    for (const [who, s] of byStaff) sb2.append(el("tr", null, el("td", { text: who }), el("td", { class: "r num", text: String(s.n) }), el("td", { class: "r num", text: money(s.cents) })));
    $("byStaffWrap").hidden = !byStaff.size;
  }

  /* ---------- gérant : menu ---------- */
  function renderMenuEditor() {
    if (!isOwner()) return;
    if (!S.menuDraft) S.menuDraft = S.menu.map((m) => ({ id: m.id, name: m.name, price: numFmt.format(m.price_cents / 100).replace(/\s/g, "") }));
    const box = $("menuEdit"); box.replaceChildren();
    if (!S.menuDraft.length) box.append(el("p", { class: "empty", text: "Aucun article. Ajoutez-en un, indiquez son prix, puis enregistrez." }));
    S.menuDraft.forEach((r, i) => {
      const n = el("input", { class: "field", id: "mn-" + i, placeholder: "Nom de l'article", "aria-label": "Nom de l'article", maxlength: "60" });
      n.value = r.name; n.addEventListener("input", () => { r.name = n.value; });
      const p = el("input", { class: "field num", id: "mp-" + i, placeholder: "0,00", inputmode: "decimal", "aria-label": "Prix" });
      p.value = r.price; p.addEventListener("input", () => { r.price = p.value; });
      box.append(el("div", { class: "menu-row" }, n, p,
        el("button", { class: "btn small ghost danger", type: "button", text: "Retirer", onclick: () => { S.menuDraft.splice(i, 1); renderMenuEditor(); } })));
    });
  }
  $("addMenuRow").addEventListener("click", () => {
    S.menuDraft.push({ id: null, name: "", price: "" }); renderMenuEditor();
    const last = $("mn-" + (S.menuDraft.length - 1)); if (last) last.focus();
  });
  $("menuPanel").addEventListener("toggle", () => { if (!$("menuPanel").open) { S.menuDraft = null; renderMenuEditor(); } });
  $("saveMenu").addEventListener("click", async () => {
    const keep = [], add = [];
    let sort = 0;
    for (const r of S.menuDraft) {
      const name = r.name.trim();
      if (!name) continue;
      const cents = toCents(r.price);
      if (cents === null) { $("menuStatus").textContent = "« " + name + " » a besoin d'un prix, par ex. 3,50."; return; }
      const row = { name: name.slice(0, 60), price_cents: cents, sort: sort++ };
      if (r.id != null) keep.push(Object.assign({ id: r.id }, row)); else add.push(row);
    }
    const keptIds = new Set(keep.map((r) => r.id));
    const removed = S.menu.filter((m) => !keptIds.has(m.id)).map((m) => m.id);
    $("saveMenu").disabled = true; $("menuStatus").textContent = "Enregistrement…";
    const steps = [];
    if (removed.length) steps.push(sb.from("menu_items").delete().in("id", removed));
    if (keep.length) steps.push(sb.from("menu_items").upsert(keep));
    if (add.length) steps.push(sb.from("menu_items").insert(add));
    steps.push(sb.from("settings").update({ currency: $("currency").value.trim().slice(0, 6) }).eq("id", 1));
    const results = await Promise.all(steps);
    $("saveMenu").disabled = false;
    const bad = results.find((r) => r.error);
    if (bad) { $("menuStatus").textContent = ""; failed(bad.error, "enregistrer le menu"); return; }
    $("menuStatus").textContent = "Enregistré.";
    toast("Menu enregistré");
    S.menuDraft = null;
    await loadMenu(); renderAll();
  });

  /* ---------- gérant : navigation par jour + filtres ---------- */
  async function goDay(d) {
    if (!d) return;
    S.day = d; $("dayPick").value = d;
    S.orders = []; renderOrders(); renderSummary();
    await loadOrders(); renderOrders(); renderSummary();
  }
  $("dayPick").addEventListener("change", (e) => goDay(e.target.value));
  $("prevDay").addEventListener("click", () => goDay(shiftDay(S.day, -1)));
  $("nextDay").addEventListener("click", () => goDay(shiftDay(S.day, 1)));
  $("todayBtn").addEventListener("click", () => goDay(todayStr()));
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
    S.filter = b.dataset.f;
    document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderOrders();
  }));

  function renderAll() { renderMenu(); renderCart(); renderOrders(); renderSummary(); renderMenuEditor(); }

  // Premier affichage : écran de connexion sauf si une session est déjà enregistrée.
  sb.auth.getSession().then(({ data }) => { if (!data.session) $("loginView").hidden = false; });
})();
