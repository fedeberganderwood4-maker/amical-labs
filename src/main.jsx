import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createVideoGeneration,
  getCredits,
  getGeneration,
  getSession,
  listGenerations,
} from "./services/videoApi";
import "./styles.css";

const nav = [
  ["dashboard", "Tableau de bord", "⌂"],
  ["create", "Créer une vidéo", "✦"],
  ["characters", "Mes personnages", "♙"],
  ["videos", "Mes vidéos", "▣"],
  ["history", "Historique", "◷"],
  ["credits", "Crédits", "◇"],
  ["settings", "Paramètres", "⚙"],
];

const characters = [
  { name: "Alpha", img: "/alpha.png", refs: "3 références", date: "20 avr. 2025" },
  { name: "Shadow", img: "/shadow.png", refs: "3 références", date: "18 avr. 2025" },
  { name: "Neon", img: "/neon.png", refs: "3 références", date: "15 avr. 2025" },
  { name: "Ragnar", img: "/alpha.png", refs: "2 références", date: "12 avr. 2025" },
  { name: "Luna", img: "/neon.png", refs: "3 références", date: "10 avr. 2025" },
  { name: "Kairo", img: "/shadow.png", refs: "3 références", date: "8 avr. 2025" },
];

// Kept as visual fallback data from the imported AMICAL LABS design. Real API records
// take precedence as soon as the authenticated backend returns any.
const sampleGenerations = [
  {
    title: "Remplacement de personnage",
    status: "Terminé",
    credits: "25 crédits",
    img: "/hero-reference.png",
    time: "22 avr. 2025 · 14:32",
  },
  {
    title: "Suppression de personnages",
    status: "En cours",
    credits: "18 crédits",
    img: "/hero-reference.png",
    time: "22 avr. 2025 · 11:20",
  },
  {
    title: "Style 3D personnalisé",
    status: "Terminé",
    credits: "30 crédits",
    img: "/hero-reference.png",
    time: "21 avr. 2025 · 18:45",
  },
  {
    title: "Gaming Scene",
    status: "Échec",
    credits: "25 crédits",
    img: "/hero-reference.png",
    time: "20 avr. 2025 · 16:10",
  },
];

const statusLabel = {
  queued: "En file",
  processing: "En cours",
  completed: "Terminé",
  failed: "Échec",
};

function Icon({ children }) {
  return <span className="icon">{children}</span>;
}

function formatGeneration(generation) {
  const date = generation.created_at
    ? new Date(generation.created_at).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "À l’instant";
  return {
    title: generation.mode === "character-replace" ? "Remplacement de personnage" : "Text-to-video",
    status: statusLabel[generation.status] || generation.status,
    credits: `${generation.credits_used || 0} crédits`,
    img: "/hero-reference.png",
    time: date,
    prompt: generation.prompt,
    videoUrl: generation.video_url,
    taskId: generation.task_id,
  };
}

function App() {
  const [page, setPage] = useState("dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [mode, setMode] = useState("text");
  const [session, setSession] = useState({ loading: true, authenticated: false });
  const [credits, setCredits] = useState(null);
  const [records, setRecords] = useState([]);
  const [apiNotice, setApiNotice] = useState("");

  const refreshAccount = async () => {
    try {
      const currentSession = await getSession();
      setSession({ loading: false, ...currentSession });
      if (!currentSession.authenticated) return;
      const [creditAccount, history] = await Promise.all([getCredits(), listGenerations()]);
      setCredits(creditAccount.credits);
      setRecords(history.generations || []);
      setApiNotice("");
    } catch (error) {
      setSession((current) => ({ ...current, loading: false }));
      setApiNotice(error.message);
    }
  };

  useEffect(() => {
    refreshAccount();
  }, []);

  const go = (nextPage) => {
    setPage(nextPage);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onGenerationCreated = async (generation) => {
    setRecords((current) => [
      generation,
      ...current.filter((item) => item.id !== generation.id),
    ]);
    try {
      const account = await getCredits();
      setCredits(account.credits);
    } catch {
      // The generation status remains useful even if a later balance refresh fails.
    }
  };

  const liveGenerations = useMemo(() => records.map(formatGeneration), [records]);
  const visualGenerations = liveGenerations.length ? liveGenerations : sampleGenerations;

  return (
    <div className="app">
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="brand">
          <img src="/logo.png" alt="AMICAL LABS" />
        </div>
        <nav>
          {nav.map(([id, label, ico]) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => go(id)}
            >
              <Icon>{ico}</Icon>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="user-mini">
          <div className="avatar">J</div>
          <div>
            <b>{session.user?.id || "Visiteur"}</b>
            <small>{session.authenticated ? "Utilisateur connecté" : "Connexion requise"}</small>
          </div>
          <span>···</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileMenu(!mobileMenu)}>
            ☰
          </button>
          <div className="mobile-brand">
            <img src="/logo.png" alt="AMICAL LABS" />
          </div>
          <div className="top-actions">
            <div className="credits-pill">
              ◇ <b>{credits ?? "—"}</b> crédits
            </div>
            <button className="round">♧</button>
            <div className="avatar">J</div>
          </div>
        </header>

        <div className="content">
          {!session.loading && !session.authenticated && (
            <div className="auth-notice">
              <b>Connexion requise pour les données réelles.</b> L’interface est conservée, mais
              les crédits, l’historique et la génération restent protégés par le backend.
            </div>
          )}
          {apiNotice && <div className="error-notice">{apiNotice}</div>}
          {page === "dashboard" && (
            <Dashboard go={go} credits={credits} generations={visualGenerations} />
          )}
          {page === "create" && (
            <Create
              mode={mode}
              setMode={setMode}
              authenticated={session.authenticated}
              credits={credits}
              onGenerationCreated={onGenerationCreated}
            />
          )}
          {page === "characters" && <Characters />}
          {page === "videos" && (
            <Videos generations={visualGenerations} hasLiveData={Boolean(liveGenerations.length)} />
          )}
          {page === "history" && <History generations={liveGenerations} />}
          {page === "credits" && <Credits credits={credits} />}
          {page === "settings" && <Settings userId={session.user?.id} />}
        </div>
      </main>

      <div className="mobile-nav">
        <button onClick={() => go("dashboard")} className={page === "dashboard" ? "sel" : ""}>
          ⌂<small>Accueil</small>
        </button>
        <button onClick={() => go("create")} className={page === "create" ? "sel" : ""}>
          ✦<small>Créer</small>
        </button>
        <button
          onClick={() => go("characters")}
          className={page === "characters" ? "sel" : ""}
        >
          ♙<small>Persos</small>
        </button>
        <button onClick={() => go("videos")} className={page === "videos" ? "sel" : ""}>
          ▣<small>Vidéos</small>
        </button>
        <button onClick={() => setMobileMenu(true)}>
          ☰<small>Plus</small>
        </button>
      </div>
    </div>
  );
}

function Dashboard({ go, credits, generations }) {
  return (
    <section>
      <div className="hero-grid">
        <div className="hero">
          <div className="hero-copy">
            <h1>Bonjour 👋</h1>
            <h2>Prêt à créer votre prochaine vidéo ?</h2>
            <p>Transformez vos idées en vidéos incroyables avec l’IA.</p>
            <button className="gradient-btn" onClick={() => go("create")}>
              Créer une vidéo <span>→</span>
            </button>
          </div>
          <div className="hero-art">
            <img src="/hero-reference.png" alt="Création vidéo IA" />
          </div>
        </div>
        <div className="balance card">
          <span>Crédits disponibles</span>
          <strong>◇ {credits ?? "—"}</strong>
          <button className="gradient-btn small" onClick={() => go("credits")}>
            Acheter des crédits
          </button>
        </div>
      </div>

      <div className="stats">
        <Stat icon="▣" title="Vidéos générées" value={generations.length} trend="live" />
        <Stat
          icon="◴"
          title="Générations terminées"
          value={generations.filter((g) => g.status === "Terminé").length}
          trend="live"
        />
        <Stat
          icon="◇"
          title="Crédits utilisés"
          value={generations.reduce((sum, item) => sum + Number.parseInt(item.credits, 10) || 0, 0)}
          trend="live"
        />
        <Stat icon="◷" title="Temps de traitement" value="—" trend="suivi" />
      </div>

      <div className="two-col">
        <Panel title="Générations récentes" link="Voir tout →" onLink={() => go("history")}>
          {generations.slice(0, 3).map((generation, index) => (
            <GenerationRow key={generation.taskId || index} g={generation} />
          ))}
        </Panel>
        <Panel title="Mes personnages récents" link="Voir tout →" onLink={() => go("characters")}>
          <div className="character-strip">
            {characters.slice(0, 3).map((character, index) => (
              <CharacterCard key={index} c={character} compact />
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function Stat({ icon, title, value, trend }) {
  return (
    <div className="stat card">
      <div className="stat-icon">
        <Icon>{icon}</Icon>
      </div>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <em>{trend}</em>
      </div>
    </div>
  );
}

function Panel({ title, link, onLink, children }) {
  return (
    <div className="panel card">
      <div className="panel-head">
        <h3>{title}</h3>
        {link && <button onClick={onLink}>{link}</button>}
      </div>
      {children}
    </div>
  );
}

function GenerationRow({ g }) {
  const statusClass = g.status.toLowerCase().replace(" ", "-");
  return (
    <div className="generation-row">
      <img src={g.img} alt="" />
      <div className="grow">
        <b>{g.title}</b>
        <small>{g.time}</small>
      </div>
      <div className={`status ${statusClass}`}>{g.status}</div>
      <small>{g.credits}</small>
    </div>
  );
}

function Create({ mode, setMode, authenticated, credits, onGenerationCreated }) {
  const [prompt, setPrompt] = useState("");
  const [generation, setGeneration] = useState(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!generation?.task_id || ["completed", "failed"].includes(generation.status)) {
      return undefined;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await getGeneration(generation.task_id);
        if (cancelled) return;
        setGeneration(result.generation);
        onGenerationCreated(result.generation);
        if (["completed", "failed"].includes(result.generation.status)) {
          setMessage(
            result.generation.status === "completed"
              ? "Votre vidéo est prête."
              : result.generation.error_message || "La génération a échoué. Les crédits sont remboursés.",
          );
        }
      } catch (error) {
        if (!cancelled) setMessage(error.message);
      }
    };
    poll();
    const interval = window.setInterval(poll, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [generation?.task_id, generation?.status]);

  const launch = async () => {
    setMessage("");
    if (!authenticated) {
      setMessage("Connectez un utilisateur au backend avant de lancer une génération.");
      return;
    }
    if (mode !== "text") {
      setMessage(
        "Le mode de remplacement conserve son interface, mais attend encore les URLs vidéo et références du stockage utilisateur.",
      );
      return;
    }
    if (prompt.trim().length < 3) {
      setMessage("Décrivez la scène en au moins 3 caractères.");
      return;
    }
    if (credits !== null && credits < 25) {
      setMessage("Solde insuffisant pour cette génération.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createVideoGeneration({
        prompt: prompt.trim(),
        mode: "text-to-video",
        requestId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      });
      setGeneration(result.generation);
      onGenerationCreated(result.generation);
      setMessage("Tâche créée. Le statut sera actualisé automatiquement.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const currentStatus = generation ? statusLabel[generation.status] || generation.status : null;
  return (
    <section>
      <div className="page-title">
        <h1>Créer une vidéo</h1>
        <p>Choisissez le mode de création qui correspond à votre besoin.</p>
      </div>
      <div className="mode-grid">
        <button
          className={`mode-card ${mode === "text" ? "selected" : ""}`}
          onClick={() => setMode("text")}
        >
          <div className="mode-icon">✦</div>
          <div>
            <b>Text-to-video</b>
            <p>Décrivez une scène et préparez une génération Seedance.</p>
          </div>
        </button>
        <button
          className={`mode-card ${mode === "replace" ? "selected" : ""}`}
          onClick={() => setMode("replace")}
        >
          <div className="mode-icon">♙</div>
          <div>
            <b>Remplacer un personnage</b>
            <p>Le parcours Character Reference existant est conservé pour le branchement stockage.</p>
          </div>
        </button>
      </div>
      <div className="steps card">
        {["1. Prompt", "2. Références", "3. Instructions", "4. Génération", "5. Résultat"].map(
          (step, index) => (
            <span className={index === 0 ? "current" : ""} key={step}>
              {step}
            </span>
          ),
        )}
      </div>
      <div className="studio-grid">
        <div className="panel card">
          <h3>
            <i>1</i> Décrivez votre scène
          </h3>
          <p className="muted">
            Le prompt est envoyé au backend AMICAL LABS, jamais directement à BytePlus.
          </p>
          <textarea
            className="prompt-input"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={2000}
            placeholder="Ex. Un plan cinématique d’une ville futuriste sous la pluie, caméra en travelling lent..."
            disabled={mode !== "text" || submitting}
          />
          <div className="prompt-meta">
            <span>{prompt.length}/2000</span>
            <span>Coût estimé : 25 crédits</span>
          </div>
          <button className="gradient-btn" onClick={launch} disabled={submitting || mode !== "text"}>
            {submitting ? "Création de la tâche…" : "Lancer la génération →"}
          </button>
          {generation && (
            <div className="generation-result">
              <div>
                <b>Statut : {currentStatus}</b>
                {generation.task_id && <small>Task ID : {generation.task_id}</small>}
              </div>
              {generation.video_url && (
                <video controls src={generation.video_url} className="result-video" />
              )}
            </div>
          )}
          {message && <div className="inline-message">{message}</div>}
        </div>
        <div className="tips card">
          <h3>Astuces</h3>
          <p>✓ Décrivez le sujet, l’action, le décor et le mouvement caméra.</p>
          <p>✓ Utilisez une vidéo ou des références accessibles par URL pour Character Reference.</p>
          <p>✓ Une erreur BytePlus ne déduit pas définitivement les crédits.</p>
        </div>
      </div>
      <div className="footer-actions">
        <button className="ghost">← Retour</button>
        <span className="muted">Modèle : Seedance configuré côté serveur</span>
      </div>
    </section>
  );
}

function Characters() {
  return (
    <section>
      <div className="page-title row-title">
        <div>
          <h1>Mes personnages</h1>
          <p>Gérez vos références de personnages 3D.</p>
        </div>
        <button className="gradient-btn">＋ Ajouter un personnage</button>
      </div>
      <div className="character-grid">
        {characters.map((character, index) => (
          <CharacterCard key={index} c={character} />
        ))}
      </div>
    </section>
  );
}

function CharacterCard({ c, compact }) {
  return (
    <div className={`character-card card ${compact ? "compact" : ""}`}>
      <div className="char-img">
        <img src={c.img} alt={c.name} />
        <button>⋮</button>
      </div>
      <b>{c.name}</b>
      <small>
        {c.refs} · {c.date}
      </small>
      {!compact && (
        <div className="char-actions">
          <button>Utiliser</button>
          <button>♙</button>
          <button>✎</button>
        </div>
      )}
    </div>
  );
}

function Videos({ generations, hasLiveData }) {
  return (
    <section>
      <div className="page-title">
        <h1>Mes vidéos</h1>
        <p>Retrouvez toutes vos créations générées.</p>
      </div>
      <div className="filters">
        <button className="active">Toutes</button>
        <button>Terminées</button>
        <button>En cours</button>
        <button>Échecs</button>
        <div className="search">⌕ Rechercher...</div>
      </div>
      {!hasLiveData && (
        <div className="muted data-note">Aucune génération authentifiée à afficher pour le moment.</div>
      )}
      <div className="video-list card">
        {generations.map((generation, index) => (
          <div className="video-row" key={generation.taskId || index}>
            <img src={generation.img} alt="" />
            <div className="grow">
              <b>{generation.title}</b>
              <small>
                {generation.prompt || generation.time} · {generation.time}
              </small>
            </div>
            <div className={`status ${generation.status.toLowerCase().replace(" ", "-")}`}>
              {generation.status}
            </div>
            <button className="round">▶</button>
            <button className="round">↓</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function History({ generations }) {
  return (
    <section>
      <div className="page-title">
        <h1>Historique des générations</h1>
        <p>Suivez l’activité réelle de votre studio.</p>
      </div>
      <div className="filters">
        <div className="select">Tous les types⌄</div>
        <div className="select">Tous les statuts⌄</div>
      </div>
      {generations.length === 0 ? (
        <div className="empty-state card">
          <b>Aucune génération enregistrée</b>
          <span>Les nouvelles tâches apparaîtront ici après authentification.</span>
        </div>
      ) : (
        <div className="table card">
          <div className="tr th">
            <span>Date</span>
            <span>Type</span>
            <span>Modèle</span>
            <span>Statut</span>
            <span>Crédits</span>
          </div>
          {generations.map((generation, index) => (
            <div className="tr" key={generation.taskId || index}>
              <span>
                {generation.time}
                <br />
                <small>{generation.taskId || "—"}</small>
              </span>
              <span>{generation.title}</span>
              <span>Seedance</span>
              <span className={`status ${generation.status.toLowerCase().replace(" ", "-")}`}>
                {generation.status}
              </span>
              <span>{generation.credits.replace(" crédits", "")}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Credits({ credits }) {
  const packs = [
    ["Starter", "50 crédits", "4,99 $"],
    ["Creator", "150 crédits", "12,99 $"],
    ["Pro", "500 crédits", "39,99 $"],
    ["Studio", "1 500 crédits", "99,99 $"],
  ];
  return (
    <section>
      <div className="page-title">
        <h1>Crédits</h1>
        <p>Gérez votre solde et vos achats.</p>
      </div>
      <div className="credit-top card">
        <div>
          <span>Votre solde</span>
          <strong>◇ {credits ?? "—"} crédits</strong>
        </div>
        <button className="gradient-btn">Acheter des crédits</button>
      </div>
      <h3 className="section-label">Offres de crédits</h3>
      <div className="packs">
        {packs.map((pack, index) => (
          <div className={`pack card ${index === 1 ? "featured" : ""}`} key={pack[0]}>
            <b>{pack[0]}</b>
            <strong>{pack[1]}</strong>
            <span>{pack[2]}</span>
            <button className="gradient-btn small">Choisir</button>
          </div>
        ))}
      </div>
      <h3 className="section-label">Historique des crédits</h3>
      <div className="empty-state card">
        <b>Les transactions sont enregistrées côté serveur.</b>
        <span>Les achats seront activés avec le fournisseur de paiement choisi.</span>
      </div>
    </section>
  );
}

function Settings({ userId }) {
  return (
    <section>
      <div className="page-title">
        <h1>Paramètres</h1>
        <p>Gérez votre profil et vos préférences.</p>
      </div>
      <div className="settings card">
        <aside>
          <button className="active">♙ Profil</button>
          <button>♙ Sécurité</button>
          <button>⚙ Préférences</button>
          <button>◇ Compte</button>
        </aside>
        <div className="settings-body">
          <h3>Profil</h3>
          <div className="profile-head">
            <div className="avatar big">J</div>
            <div>
              <b>{userId || "Utilisateur non connecté"}</b>
              <small>Géré par le système d’authentification du projet</small>
            </div>
          </div>
          <label>
            Identifiant
            <input value={userId || "Connexion requise"} readOnly />
          </label>
        </div>
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);