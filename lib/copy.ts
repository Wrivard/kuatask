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
/**
 * French plural agreement, which is simpler than English but not free.
 *
 * Four places had grown their own inline ternary, and a fifth would have been
 * written the same way. The rule here is only the regular one — add an s — so
 * anything irregular passes its own second form.
 */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const copy = {
  app: {
    name: "Küa Tasks",
    description: "Les tâches partagées de Küa.",
  },

  nav: {
    today: "Aujourd'hui",
    tomorrow: "Demain",
    week: "Cette semaine",
    month: "Ce mois-ci",
    later: "Plus tard",
    undated: "Sans date",
    calendar: "Calendrier",
    prevMonth: "Mois précédent",
    nextMonth: "Mois suivant",
    board: "Tableau",
    list: "Liste",
    settings: "Réglages",
    done: "Terminé",
    doneToday: "Terminé aujourd'hui",
    doneRecent: "Terminé cette semaine",
    doneWeek: (n: number) => `${plural(n, "autre")} cette semaine`,
  },

  filter: {
    all: "Tout",
    mine: "Moi",
  },

  preview: {
    warning: "Aperçu — les modifications touchent les vraies données.",
  },

  search: {
    title: "Résultats",
    count: (n: number) => plural(n, "résultat"),
  },

  calendar: {
    bands: {
      morning: "Matin",
      afternoon: "Après-midi",
      evening: "Soir",
      untimed: "Sans heure",
    },
    more: (n: number) => `+${n} de plus`,
    cell: (day: string, n: number) =>
      n === 0 ? day : `${day} — ${plural(n, "tâche")}`,
    mode: "Mois ou semaine",
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
    dropHere: "Déposer ici",
    tooMuchDoing: "Beaucoup de choses en cours en même temps.",
    collapse: "Replier la colonne",
    expand: "Déplier la colonne",
  },

  composer: {
    placeholder: "Ajouter une tâche…",
    searchPlaceholder: "Chercher…",
    hint: "Entrée pour ajouter",
    emptyTitle: "Sans titre",
    pasted: (n: number) => `${plural(n, "tâche")} ${n === 1 ? "ajoutée" : "ajoutées"}`,
    chipOff: "Ignorer cette lecture",
    chipOn: "Reprendre cette lecture",
  },

  task: {
    hasNotes: "Contient des notes",
    duplicate: "Dupliquer",
    duplicated: "Copie créée",
    links: "Liens",
    overdueCount: (n: number) => `${n} en retard`,
    filterByLabel: (label: string) => `Chercher #${label}`,
    filterByPerson: (name: string) => `Voir les tâches de ${name}`,
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
    quickNextWeek: "Dans une semaine",
    createdOn: (when: string) => `créée ${when}`,
    pickDate: "Choisir une date",
    close: "Fermer",
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
    returning: "Ta session s'est terminée. Redemande un lien pour revenir.",
    title: "Küa Tasks",
    emailPlaceholder: "Courriel",
    send: "Envoyer le lien",
    sending: "Envoi…",
    sent: (email: string) => `Lien envoyé à ${email}. Vérifie tes courriels.`,
    resend: "Renvoyer",
    promote: "Nommer admin",
    demote: "Retirer admin",
    roleChanged: "Rôle mis à jour",
    resendIn: (s: number) => `Renvoyer dans ${s}s`,
    signOut: "Se déconnecter",
  },

  setup: {
    title: "Configuration manquante",
    body: "Le serveur ne trouve pas les clés Supabase. Ajoute ces quatre variables dans Vercel — Settings, Environment Variables, en cochant Production :",
    rebuild:
      "Ensuite relance un build complet, pas juste un redeploy : les deux variables NEXT_PUBLIC sont compilées dans le bundle, donc elles doivent exister avant le build.",
    check: "Vérifier l'état de la configuration",
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
    resend: "Renvoyer",
    promote: "Nommer admin",
    demote: "Retirer admin",
    roleChanged: "Rôle mis à jour",
    resent: "Invitation renvoyée",
    neverSent: "Aucun courriel envoyé",
    invitedOn: (when: string) => `Invitée ${when}`,
    roleAdmin: "Admin",
    roleMember: "Membre",
    you: "toi",
  },

  settings: {
    profile: "Ton profil",
    theme: "Thème",
    version: "Version",
    localBuild: "développement local",
    deleteAccount: "Supprimer mon compte",
    deleteAccountBody:
      "Ton compte, ton profil et ton accès à cet espace sont supprimés définitivement. Tes tâches restent — celles qui ne sont pas terminées passent à « Personne ».",
    deleteAccountConfirm: (email: string) => `Tape ${email} pour confirmer`,
    deleteAccountDo: "Supprimer définitivement",
    deleting: "Suppression…",
    cancel: "Annuler",
    themeHint: "Le thème est propre à cet appareil.",
    themeLight: "Clair",
    themeDark: "Sombre",
    sound: "Son",
    soundOn: "Son activé",
    soundOff: "Son désactivé",
    accent: "Ta couleur",
    accentTaken: "Déjà prise par ton associé",
    displayName: "Nom affiché",
    displayNameHint: "C'est ce nom qui apparaît sur les tâches et dans @mentions.",
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
    scopeBoard: "Sur le tableau",
    scopeCalendar: "Calendrier",
  },

  error: {
    unreachableTitle: "La base de données ne répond pas",
    unreachableBody:
      "Le projet Supabase est probablement en pause — le plan gratuit met un projet en pause après une semaine sans activité. Réveille-le depuis le tableau de bord, puis recharge la page.",
    unreachableNothingLost: "Rien n'est perdu. Tes tâches sont toujours là.",
    saveFailed: "La modification n'a pas été enregistrée. Réessaie.",
    titleLength: "Un titre fait entre 1 et 500 caractères.",
    alreadyThere: "C'est déjà là.",
    gone: "Cette tâche n'existe plus.",
    missingField: "Il manque une information.",
    notAllowed: "Tu n'as pas les droits pour ça.",
    offline: "Connexion perdue. Les modifications reprendront au retour du réseau.",
    inviteFailed: "L'invitation n'a pas pu être envoyée. Vérifie l'adresse.",
    inviteExists: "Cette personne est déjà membre ou déjà invitée.",
    tooManyInvites: "Trop d'invitations d'un coup. Réessaie dans une heure.",
    lastAdmin: "Il faut au moins un admin dans l'espace.",
    loginFailed: "Le lien n'a pas pu être envoyé. Vérifie l'adresse.",
    serviceDown:
      "La base de données ne répond pas. Le projet Supabase est probablement en pause — réveille-le depuis le tableau de bord, puis réessaie.",
    sessionExpired: "Ta session a expiré. Reconnecte-toi.",
    linkExpired: "Ce lien a expiré. Demandes-en un nouveau.",
    crashed: "Cette vue a planté.",
    crashedBody:
      "Tes tâches sont intactes — c'est l'affichage qui a lâché, pas les données. Réessaie, ou recharge la page.",
    retry: "Réessayer",
  },

  /** Text that exists only for screen readers, never shown on screen. */
  a11y: {
    progress: (done: number, total: number) =>
      `Progression : ${done} sur ${total} tâches terminées aujourd'hui`,
    streak: (days: number) => `${plural(days, "jour")} d'affilée`,
    column: (title: string, count: number) => `${title} — ${plural(count, "tâche")}`,
    skipToContent: "Aller au contenu",
    lens: (name: string) => `Filtre : ${name}`,
    /*
      Announcements name the task. A toast is a glance, and a glance is exactly
      what a screen reader does not get — "Reprogrammée" alone says nothing
      about which of eleven tasks moved.
    */
    reopened: (title: string) => `${title} — rouverte`,
    assigned: (title: string, name: string) => `${title} — assignée à ${name}`,
    rescheduled: (title: string, when: string) => `${title} — déplacée au ${when}`,
    undated: (title: string) => `${title} — date retirée`,
    deleted: (title: string) => `${title} — supprimée`,
  },

  notFound: {
    title: "Page introuvable",
    body: "Ce lien ne mène nulle part.",
    back: "Retour à la liste",
  },
};
