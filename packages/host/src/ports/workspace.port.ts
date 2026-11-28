export type WorkspacePort = {
  /** the id of genba's workspace with this label, created with its logs tab when absent */
  ensure(label: string, logsCommand: string): Promise<string>;
  /** closes the workspace genba created under this label, if it is still there */
  remove(label: string): Promise<void>;
};
