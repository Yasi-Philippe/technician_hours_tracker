/**
 * Interface translations.
 *
 * Italian and Spanish are both first-class. Nothing user-facing is written inline in a
 * component — the spreadsheet is always Italian, but the app belongs to whoever is
 * holding the phone.
 *
 * The Italian dictionary is the reference: `Strings` is derived from it, so a key added
 * there and forgotten in Spanish is a compile error rather than a blank label on a
 * technician's screen.
 */

import type { Language } from './types'

const it = {
  appName: 'Ore',
  appTagline: 'Registro delle ore',

  // Navigation
  navToday: 'Oggi',
  navWeek: 'Settimana',
  navStats: 'Statistiche',
  navExport: 'Esporta',
  navSettings: 'Impostazioni',

  // Onboarding
  welcomeTitle: 'Benvenuto',
  welcomeBody: 'Registra le tue ore in pochi secondi. Iniziamo con due domande.',
  chooseLanguage: 'Scegli la lingua',
  yourName: 'Il tuo nome',
  yourNamePlaceholder: 'Nome e cognome',
  yourEmail: 'La tua e-mail',
  yourEmailPlaceholder: 'nome.cognome@azienda.com',
  continue: 'Continua',
  start: 'Inizia',
  needCompanyFileTitle: 'Serve il file aziendale',
  needCompanyFileBody:
    'Apri il file che ti ha inviato la tua azienda. Contiene i progetti e il modello del rapporto.',
  loadCompanyFile: 'Apri il file aziendale',
  companyFileLoaded: 'File aziendale caricato',
  nameRequired: 'Scrivi il tuo nome per continuare',

  // Day entry
  today: 'Oggi',
  addEntry: 'Aggiungi',
  newEntry: 'Nuovo rapporto',
  editEntry: 'Modifica rapporto',
  sameAsYesterday: 'Come ieri',
  noEntriesToday: 'Nessun rapporto per questo giorno',
  noEntriesTodayHint: 'Tocca Aggiungi per registrare le ore.',

  from: 'Dalle',
  to: 'Alle',
  totalHours: 'Ore totali',
  normalHours: 'Ore normali',
  extraHours: 'Ore extra',
  extraShort: 'extra',
  overtimeAutomatic: 'Automatico',
  overtimeManualMode: 'Manuale',
  overtimeAutoExplain: 'Calcolate da sole: tutto quello che supera {h} di lavoro.',
  overtimeManualExplain: 'Decidi tu quante ore extra segnare.',

  project: 'Progetto',
  section: 'Sezione',
  interventionType: 'Tipo di intervento',
  status: 'Stato',
  description: 'Descrizione',
  descriptionPlaceholder: 'Cosa hai fatto?',
  colleagues: 'Con chi eri',
  colleaguesNone: 'Da solo',
  addColleague: 'Aggiungi collega',
  chooseFromList: 'Scegli dalla lista',
  otherValue: 'Altro…',
  recentlyUsed: 'Usati di recente',

  save: 'Salva',
  saved: 'Salvato',
  cancel: 'Annulla',
  delete: 'Elimina',
  deleted: 'Rapporto eliminato',
  undo: 'Annulla',
  close: 'Chiudi',
  back: 'Indietro',
  confirm: 'Conferma',

  // Week view
  week: 'Settimana',
  weekTotal: 'Totale settimana',
  previousWeek: 'Settimana precedente',
  nextWeek: 'Settimana successiva',
  thisWeek: 'Questa settimana',
  missingDay: 'Da compilare',
  daysFilled: 'giorni compilati',
  emptyWeek: 'Questa settimana è ancora vuota',
  emptyWeekHint: 'Tocca un giorno per iniziare.',

  // Stats
  hoursPerDay: 'Ore per giorno',
  byProject: 'Per progetto',
  byType: 'Per tipo di intervento',
  monthTotal: 'Totale del mese',
  averageDay: 'Media giornaliera',
  daysWorked: 'Giorni lavorati',
  noStatsYet: 'Ancora nessun dato da mostrare',
  noStatsYetHint: 'Registra qualche giornata e qui vedrai i tuoi totali.',

  // Export
  exportTitle: 'Esporta la settimana',
  exportButton: 'Crea il file Excel',
  exportSummary: 'Riepilogo',
  exportEntries: 'rapporti',
  exportDays: 'giorni',
  exportTechnicians: 'tecnici',
  exportEmpty: 'Non c’è niente da esportare per questa settimana',
  exportDone: 'File creato',
  exportNeedsPack: 'Serve il file aziendale per creare il rapporto',

  // Backup
  backupTitle: 'Copia di sicurezza',
  backupBody:
    'Salva tutti i tuoi dati in un file. Serve come copia di sicurezza e per passare a un altro telefono.',
  backupExport: 'Salva una copia',
  backupImport: 'Carica una copia',
  backupNever: 'Mai fatta',
  backupLast: 'Ultima copia',
  backupReminder: 'Non fai una copia da un po’. Falla adesso, ci vuole un secondo.',
  importedEntries: 'rapporti importati',
  importedUpdated: 'aggiornati',
  importedSkipped: 'già presenti',
  importConfirmTitle: 'Caricare questi dati?',
  importConfirmBody: 'I rapporti nuovi saranno aggiunti. Quelli più recenti restano.',

  // Settings
  language: 'Lingua',
  technician: 'Tecnico',
  companyFile: 'File aziendale',
  companyFileNone: 'Nessun file caricato',
  replaceCompanyFile: 'Sostituisci il file aziendale',
  removeCompanyFile: 'Rimuovi il file aziendale',
  removeCompanyFileConfirm: 'Rimuovere il file aziendale? I tuoi rapporti restano.',
  storage: 'Spazio',
  storagePersisted: 'I dati sono protetti su questo dispositivo',
  storageNotPersisted: 'Installa l’app per proteggere meglio i dati',
  installApp: 'Installa l’app',
  dangerZone: 'Attenzione',
  deleteAll: 'Cancella tutti i dati',
  deleteAllConfirm: 'Cancellare tutti i rapporti? Non si può tornare indietro.',
  deleteAllDone: 'Dati cancellati',

  // Errors
  errorTitle: 'Qualcosa non ha funzionato',
  errorFileNotRead: 'Non riesco a leggere questo file',
  errorTryAgain: 'Riprova',

  credit: 'Designed and developed by Yasi Philippe Hübner',
} as const

export type Strings = { readonly [K in keyof typeof it]: string }

const es: Strings = {
  appName: 'Horas',
  appTagline: 'Registro de horas',

  navToday: 'Hoy',
  navWeek: 'Semana',
  navStats: 'Estadísticas',
  navExport: 'Exportar',
  navSettings: 'Ajustes',

  welcomeTitle: 'Bienvenido',
  welcomeBody: 'Registra tus horas en segundos. Empezamos con dos preguntas.',
  chooseLanguage: 'Elige el idioma',
  yourName: 'Tu nombre',
  yourNamePlaceholder: 'Nombre y apellidos',
  yourEmail: 'Tu correo',
  yourEmailPlaceholder: 'nombre.apellido@empresa.com',
  continue: 'Continuar',
  start: 'Empezar',
  needCompanyFileTitle: 'Falta el archivo de la empresa',
  needCompanyFileBody:
    'Abre el archivo que te ha enviado tu empresa. Contiene los proyectos y la plantilla del parte.',
  loadCompanyFile: 'Abrir el archivo de la empresa',
  companyFileLoaded: 'Archivo de la empresa cargado',
  nameRequired: 'Escribe tu nombre para continuar',

  today: 'Hoy',
  addEntry: 'Añadir',
  newEntry: 'Nuevo parte',
  editEntry: 'Editar parte',
  sameAsYesterday: 'Como ayer',
  noEntriesToday: 'No hay partes para este día',
  noEntriesTodayHint: 'Toca Añadir para registrar las horas.',

  from: 'Desde',
  to: 'Hasta',
  totalHours: 'Horas totales',
  normalHours: 'Horas normales',
  extraHours: 'Horas extra',
  extraShort: 'extra',
  overtimeAutomatic: 'Automático',
  overtimeManualMode: 'Manual',
  overtimeAutoExplain: 'Se calculan solas: todo lo que pasa de {h} de trabajo.',
  overtimeManualExplain: 'Decides tú cuántas horas extra apuntar.',

  project: 'Proyecto',
  section: 'Sección',
  interventionType: 'Tipo de intervención',
  status: 'Estado',
  description: 'Descripción',
  descriptionPlaceholder: '¿Qué has hecho?',
  colleagues: 'Con quién estabas',
  colleaguesNone: 'Solo',
  addColleague: 'Añadir compañero',
  chooseFromList: 'Elige de la lista',
  otherValue: 'Otro…',
  recentlyUsed: 'Usados hace poco',

  save: 'Guardar',
  saved: 'Guardado',
  cancel: 'Cancelar',
  delete: 'Eliminar',
  deleted: 'Parte eliminado',
  undo: 'Deshacer',
  close: 'Cerrar',
  back: 'Atrás',
  confirm: 'Confirmar',

  week: 'Semana',
  weekTotal: 'Total de la semana',
  previousWeek: 'Semana anterior',
  nextWeek: 'Semana siguiente',
  thisWeek: 'Esta semana',
  missingDay: 'Sin rellenar',
  daysFilled: 'días rellenados',
  emptyWeek: 'Esta semana todavía está vacía',
  emptyWeekHint: 'Toca un día para empezar.',

  hoursPerDay: 'Horas por día',
  byProject: 'Por proyecto',
  byType: 'Por tipo de intervención',
  monthTotal: 'Total del mes',
  averageDay: 'Media diaria',
  daysWorked: 'Días trabajados',
  noStatsYet: 'Todavía no hay datos que mostrar',
  noStatsYetHint: 'Registra algunos días y aquí verás tus totales.',

  exportTitle: 'Exportar la semana',
  exportButton: 'Crear el archivo Excel',
  exportSummary: 'Resumen',
  exportEntries: 'partes',
  exportDays: 'días',
  exportTechnicians: 'técnicos',
  exportEmpty: 'No hay nada que exportar en esta semana',
  exportDone: 'Archivo creado',
  exportNeedsPack: 'Hace falta el archivo de la empresa para crear el parte',

  backupTitle: 'Copia de seguridad',
  backupBody:
    'Guarda todos tus datos en un archivo. Sirve como copia de seguridad y para pasar a otro teléfono.',
  backupExport: 'Guardar una copia',
  backupImport: 'Cargar una copia',
  backupNever: 'Nunca',
  backupLast: 'Última copia',
  backupReminder: 'Hace tiempo que no haces una copia. Hazla ahora, es un segundo.',
  importedEntries: 'partes importados',
  importedUpdated: 'actualizados',
  importedSkipped: 'ya estaban',
  importConfirmTitle: '¿Cargar estos datos?',
  importConfirmBody: 'Se añadirán los partes nuevos. Los más recientes se mantienen.',

  language: 'Idioma',
  technician: 'Técnico',
  companyFile: 'Archivo de la empresa',
  companyFileNone: 'No hay ningún archivo cargado',
  replaceCompanyFile: 'Sustituir el archivo de la empresa',
  removeCompanyFile: 'Quitar el archivo de la empresa',
  removeCompanyFileConfirm: '¿Quitar el archivo de la empresa? Tus partes se mantienen.',
  storage: 'Almacenamiento',
  storagePersisted: 'Los datos están protegidos en este dispositivo',
  storageNotPersisted: 'Instala la aplicación para proteger mejor los datos',
  installApp: 'Instalar la aplicación',
  dangerZone: 'Atención',
  deleteAll: 'Borrar todos los datos',
  deleteAllConfirm: '¿Borrar todos los partes? No se puede deshacer.',
  deleteAllDone: 'Datos borrados',

  errorTitle: 'Algo no ha funcionado',
  errorFileNotRead: 'No consigo leer este archivo',
  errorTryAgain: 'Inténtalo de nuevo',

  credit: 'Designed and developed by Yasi Philippe Hübner',
}

const DICTIONARIES: Record<Language, Strings> = { it, es }

export function strings(language: Language): Strings {
  return DICTIONARIES[language] ?? DICTIONARIES.it
}

export const LANGUAGE_NAMES: Record<Language, string> = {
  it: 'Italiano',
  es: 'Español',
}
