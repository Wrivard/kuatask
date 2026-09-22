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
    activity: "Activité",
    stats: "Classement",
    notes: "Braindump",
    billing: "Facturation",
    /* The mobile overflow: six routes, five slots on the bar. */
    more: "Plus",
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

  activity: {
    empty: "Rien encore. L'historique se remplira à mesure.",
    restore: "Restaurer",
    restoring: "…",
    restored: "Tâche restaurée",
    limit: "Les 200 dernières actions.",
    verb: {
      created: "créée",
      updated: "modifiée",
      completed: "terminée",
      reopened: "rouverte",
      deleted: "supprimée",
    } as Record<string, string>,
    field: {
      title: "titre",
      notes: "notes",
      label: "étiquette",
      due_on: "date",
      due_time: "heure",
      assignee_id: "assignation",
      status: "statut",
      important: "importance",
      position: "ordre",
      completed_at: "complétion",
      completed_by: "complétion",
    } as Record<string, string>,
  },

  notes: {
    placeholder: "Vide-toi la tête… Entrée pour garder, Maj+Entrée pour une ligne",
    hint: "Entrée pour garder",
    empty: "Rien ici. Écris ce qui traîne, trie plus tard.",
    toTask: "En faire une tâche",
    discard: "Jeter",
    expiry: (days: number) =>
      `Tout se vide tout seul après ${days} jours. Ce qui compte devient une tâche.`,
  },

  billing: {
    clients: "Clients",
    newClient: "Nouveau client",
    newClientPlaceholder: "Nom du client… Entrée pour créer",
    active: "Actifs",
    archived: "Archivés",
    noClients: "Aucun client. Ajoute le premier pour commencer à suivre le temps.",
    noArchived: "Aucun client archivé.",
    allClients: "Tous les clients",
    switchClient: "Changer de client",
    backToDashboard: "Retour au tableau de bord",
    lastEntry: "Dernière entrée",
    never: "—",
    outstanding: "À recevoir",
    outstandingHint: "À facturer + facturé, pas encore payé",
    totalPaid: "Payé",
    totalAll: "Total",
    status: {
      pending: "À facturer",
      invoiced: "Facturé",
      paid: "Payé",
    },
    filter: {
      open: "À payer",
      paid: "Payé",
      all: "Tout",
    },
    col: {
      date: "Date",
      title: "Tâche",
      detail: "Détail",
      hours: "Heures",
      rate: "Taux ($/h)",
      amount: "Montant ($)",
      status: "Statut",
    },
    computed: "Calculé : heures × taux. Tape un montant pour un prix fixe.",
    fixed: "Prix fixe. Vide la case pour revenir au calcul.",
    addRow: "Ajouter une ligne",
    deleteRow: "Supprimer la ligne",
    rowDeleted: "Ligne supprimée",
    emptyRows: "Aucune ligne ici.",
    rate: "Taux par défaut",
    rateSuffix: "$/h",
    rename: "Nom du client",
    archive: "Archiver le client",
    unarchive: "Réactiver le client",
    invalidNumber: "Ce n'est pas un nombre",
    saveFailed: "Pas pu enregistrer. On a remis la valeur d'avant.",
    shown: (n: number) => `${n} ligne${n > 1 ? "s" : ""}`,
  },

  stats: {
    period: {
      today: "Aujourd'hui",
      week: "7 jours",
      month: "30 jours",
      total: "Depuis le début",
    },
    streak: "Série",
    best: "Record",
    allTime: "Total",
    /* Says what is counted, so a number nobody expected has an explanation. */
    footnote:
      "Compte les tâches terminées qui existent encore. Une tâche supprimée après coup n'est plus comptée.",
  },

  search: {
    placeholder: "Chercher une tâche…",
    clear: "Effacer la recherche",
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
    addHere: "Ajouter ici",
    tooMuchDoing: "Beaucoup de choses en cours en même temps.",
    collapse: "Replier la colonne",
    expand: "Déplier la colonne",
  },

  composer: {
    placeholder: "Ajouter une tâche…",
    hint: "Entrée pour ajouter",
    hintOpen: "Maj+Entrée pour ajouter des notes",
    openHint: "Ajouter et ouvrir pour des notes",
    emptyTitle: "Sans titre",
    pasted: (n: number) => `${plural(n, "tâche")} ${n === 1 ? "ajoutée" : "ajoutées"}`,
    chipOff: "Ignorer cette lecture",
    chipOn: "Reprendre cette lecture",
  },

  task: {
    hasNotes: "Contient des notes",
    fresh: "Nouveau",
    freshHint: "Créée il y a moins de 3 h",
    duplicate: "Dupliquer",
    duplicated: "Copie créée",
    links: "Liens",
    overdueCount: (n: number) => `${n} en retard`,
    filterByLabel: (label: string) => `Chercher #${label}`,
    filterByPerson: (name: string) => `Voir les tâches de ${name}`,
    edit: "Modifier",
    color: "Couleur",
    /* Said plainly, because a colour that only shows in one view is surprising. */
    colorHint: "Visible dans le calendrier seulement.",
    colorNone: "Aucune",
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
    /* The moment the tag syntax is worth knowing is the moment nothing matched. */
    searchTagHint: "Essaie #étiquette pour filtrer par étiquette.",
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
    /* The second press. Sits in the same button, so nothing moves. */
    removeConfirm: "Confirmer",
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
    avatar: "Photo",
    avatarHint:
      "Colle l'adresse d'une image. Sans photo, tes initiales sur ta couleur.",
    avatarPlaceholder: "https://…",
    avatarRemove: "Retirer",
    avatarBroken: "Cette image ne se charge pas. Tes initiales restent affichées.",
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
    /*
      The six identity colours, named. The swatches used to announce themselves
      with their storage key — a screen reader in a French interface saying
      "green", and the one place in the app where a user-facing string did not
      come from this file.
    */
    accentNames: {
      green: "Vert",
      blue: "Bleu",
      purple: "Violet",
      amber: "Ambre",
      pink: "Rose",
      cyan: "Cyan",
    } as Record<string, string>,
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
    /*
      Shown when the database answered and said no. That is a different event
      from not answering at all, and telling somebody to go wake a project that
      is already awake sends them somewhere there is nothing to do.
    */
    refusedTitle: "La base de données a refusé la demande",
    refusedBody:
      "Ce n'est pas une panne — le projet répond. Recharge la page ; si ça " +
      "recommence, note le code ci-dessous.",
    saveFailed: "La modification n'a pas été enregistrée. Réessaie.",
    titleLength: "Un titre fait entre 1 et 500 caractères.",
    alreadyThere: "C'est déjà là.",
    gone: "Cette tâche n'existe plus.",
    missingField: "Il manque une information.",
    cannotRestore: "Cette tâche ne peut pas être restaurée.",
    alreadyRestored: "Cette tâche est déjà de retour.",
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
