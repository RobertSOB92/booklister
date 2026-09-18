export type BookResult = {
  title: string;
  author: string;
  description: string;
  sourceUrl: string;
};

export type ProcessStatus = "idle" | "processing" | "success" | "failure";

export type BookProcessItem = {
  id: string;
  originalFile: File;
  previewUrl: string;
  status: ProcessStatus;
  result?: BookResult;
  errorMessage?: string;
};
