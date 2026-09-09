/**
 * Every user-facing string. See docs/09-copy-fr.md.
 *
 * No French text is hardcoded in a component. Code, identifiers and comments
 * stay English.
 *
 * Register: Québécois, casual, direct. Sentence case everywhere including
 * buttons. Errors name what failed and what to do about it — they never
 * apologize and they are never vague.
 */
export const copy = {
  app: {
    name: "Küa Tasks",
  },

  nav: {
    today: "Aujourd'hui",
    tomorrow: "Demain",
    week: "Cette semaine",
    month: "Ce mois-ci",
    later: "Plus tard",
    undated: "Sans date",
    calendar: "Calendrier",
    board: "Tableau",
    list: "Liste",
    settings: "Réglages",
    done: "Terminé",
    doneToday: "Terminé aujourd'hui",
  },

  filter: {
    all: "Tout",
    mine: "Moi",
  },

  board: {
    groupBy: "Grouper par",
    byPerson: "Personne",
    byStatus: "Statut",
    byDue: "Échéance",
    todo: "À faire",
    doing: "En cours",
    done: "Terminé",
    unassigned: "Personne",
    empty: "Rien ici.",
  },

  composer: {
    placeholder: "Ajouter une tâche…",
    searchPlaceholder: "Chercher…",
    hint: "Entrée pour ajouter",
  },

  task: {
    titlePlaceholder: "Titre",
    notesPlaceholder: "Notes…",
    dueDate: "Échéance",
    noDate: "Pas de date",
    removeDate: "Retirer la date",
    time: "Heure",
    assignee: "Assigné à",
    nobody: "Personne",
    label: "Étiquette",
    important: "Important",
    status: "Statut",
    delete: "Supprimer",
    createdBy: (name: string) => `Créé par ${name}`,
    overdue: "En retard",
    quickToday: "Aujourd'hui",
    quickTomorrow: "Demain",
    quickMonday: "Lundi",
  },

  empty: {
    firstRun: "Rien encore. Ajoute ta première tâche.",
    today: "Rien pour aujourd'hui.",
    filtered: (name: string) => `Rien pour ${name}.`,
    day: "Rien ce jour-là.",
    search: "Aucun résultat.",
  },

  // Rotate through these in the clear-out state. Keep them flat — no praise.
  clearOut: [
    "C'est tout pour aujourd'hui.",
    "Journée vidée.",
    "Plus rien dans ta liste.",
    "La liste est vide.",
    "Fini pour aujourd'hui.",
  ],

  streak: (days: number) => (days === 1 ? "1 jour" : `${days} jours`),

  toast: {
    completed: "Terminé",
    completedMany: (n: number) => `${n} tâches terminées`,
    deleted: "Tâche supprimée",
    undo: "Annuler",
    rescheduled: "Date modifiée",
    assigned: (name: string) => `Assigné à ${name}`,
  },

  auth: {
    title: "Küa Tasks",
    emailPlaceholder: "Courriel",
    send: "Envoyer le lien",
    sending: "Envoi…",
    sent: (email: string) => `Lien envoyé à ${email}. Vérifie tes courriels.`,
    resend: "Renvoyer",
    resendIn: (s: number) => `Renvoyer dans ${s}s`,
    signOut: "Se déconnecter",
  },

  noAccess: {
    title: "Aucun accès",
    body: "Ton compte n'est rattaché à aucun espace. Demande une invitation à un admin.",
  },

  people: {
    title: "Personnes",
    members: "Membres",
    pending: "Invitations en attente",
    invite: "Inviter quelqu'un",
    invitePlaceholder: "courriel@exemple.com",
    inviteSend: "Envoyer l'invitation",
    inviteSent: (email: string) => `Invitation envoyée à ${email}`,
    revoke: "Révoquer",
    remove: "Retirer",
    roleAdmin: "Admin",
    roleMember: "Membre",
    you: "toi",
  },

  settings: {
    theme: "Thème",
    themeLight: "Clair",
    themeDark: "Sombre",
    sound: "Son",
    soundOn: "Son activé",
    soundOff: "Son désactivé",
    accent: "Ta couleur",
    displayName: "Nom affiché",
  },

  palette: {
    placeholder: "Chercher ou lancer une commande…",
    groupTasks: "Tâches",
    groupCreate: "Créer",
    groupGo: "Aller à",
    groupFilter: "Filtrer",
    groupSettings: "Réglages",
    newTask: "Nouvelle tâche",
    createNamed: (q: string) => `Créer « ${q} »`,
    empty: "Aucun résultat.",
  },

  shortcuts: {
    title: "Raccourcis",
    scopeGlobal: "Partout",
    scopeList: "Dans la liste",
    scopeCalendar: "Calendrier",
  },

  error: {
    saveFailed: "La modification n'a pas été enregistrée. Réessaie.",
    offline: "Connexion perdue. Les modifications reprendront au retour du réseau.",
    inviteFailed: "L'invitation n'a pas pu être envoyée. Vérifie l'adresse.",
    inviteExists: "Cette personne est déjà membre ou déjà invitée.",
    lastAdmin: "Il faut au moins un admin dans l'espace.",
    loginFailed: "Le lien n'a pas pu être envoyé. Vérifie l'adresse.",
    linkExpired: "Ce lien a expiré. Demandes-en un nouveau.",
  },
};
