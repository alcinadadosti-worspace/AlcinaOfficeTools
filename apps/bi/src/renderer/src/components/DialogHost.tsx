// Host dos diálogos: renderiza o diálogo ativo conforme o estado da interface.
import { useUi } from '../state/ui'
import {
  GetDataDialog,
  CsvDialog,
  ExcelDialog,
  JsonDialog,
  WebDialog,
  FolderDialog,
  EnterDataDialog,
  DatabaseDialog
} from '../dialogs/ImportDialogs'
import { ErrorDialog, SaveChangesDialog, AboutDialog, ShowDataDialog, ThemeDialog, OptionsDialog, PageSettingsDialog } from '../dialogs/MiscDialogs'
import { RelationshipDialog, ManageRelationshipsDialog, QuickMeasureDialog } from '../dialogs/ModelDialogs'

export function DialogHost() {
  const dialog = useUi((s) => s.dialog)
  if (!dialog) return null
  switch (dialog.kind) {
    case 'getData':
      return <GetDataDialog />
    case 'csv':
      return <CsvDialog path={dialog.path} />
    case 'excel':
      return <ExcelDialog path={dialog.path} />
    case 'json':
      return <JsonDialog path={dialog.path} />
    case 'web':
      return <WebDialog />
    case 'folder':
      return <FolderDialog />
    case 'enterData':
      return <EnterDataDialog />
    case 'database':
      return <DatabaseDialog />
    case 'relationship':
      return <RelationshipDialog id={dialog.id} fromTable={dialog.fromTable} fromColumn={dialog.fromColumn} toTable={dialog.toTable} toColumn={dialog.toColumn} />
    case 'manageRelationships':
      return <ManageRelationshipsDialog />
    case 'measure':
      return <QuickMeasureDialog table={dialog.table} />
    case 'theme':
      return <ThemeDialog />
    case 'options':
      return <OptionsDialog />
    case 'about':
      return <AboutDialog />
    case 'pageSettings':
      return <PageSettingsDialog pageId={dialog.pageId} />
    case 'showData':
      return <ShowDataDialog visualId={dialog.visualId} />
    case 'saveChanges':
      return <SaveChangesDialog then={dialog.then} path={dialog.path} />
    case 'error':
      return <ErrorDialog title={dialog.title} message={dialog.message} />
    default:
      return null
  }
}
