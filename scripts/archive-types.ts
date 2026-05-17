export type CloudinaryRef = {
  publicId: string;
  url: string;
  version: number;
  width: number;
  height: number;
};

export type SketchEntry = {
  id: string;
  name: string;
  path: string;
  firstCommitDate: string;
  year: number;
  lastCommitSha: string;
  archivedAt: string;
  cloudinary?: CloudinaryRef;
};

export type Archive = {
  generatedAt: string;
  sketches: SketchEntry[];
};
