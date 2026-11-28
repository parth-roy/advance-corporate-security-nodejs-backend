import { Schema } from "mongoose";

export interface IFamilyMember {
  name: string;
  relation: string;
  dateOfBirth: string;
}

export interface IUploadedDocumentFile {
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  uploadedAt?: string;
}

export interface IAcademicQualificationDocs {
  "10th"?: IUploadedDocumentFile;
  "12th"?: IUploadedDocumentFile;
  Graduation?: IUploadedDocumentFile;
  Masters?: IUploadedDocumentFile;
}

export interface ICandidateDocuments {
  aadharCard?: IUploadedDocumentFile;
  panCard?: IUploadedDocumentFile;
  bankDetails?: IUploadedDocumentFile;
  voterId?: IUploadedDocumentFile;
  academicQualification?: IAcademicQualificationDocs;
  colorPhoto?: IUploadedDocumentFile;
  pcc?: IUploadedDocumentFile;
  mfc?: IUploadedDocumentFile;
  characterCertificate?: IUploadedDocumentFile;
  previousEsiPf?: IUploadedDocumentFile & { esiNumber?: string; pfNumber?: string };
  previousExperienceProof?: IUploadedDocumentFile;
  otherDocument?: IUploadedDocumentFile;
}

export const FamilyMemberSchema = new Schema<IFamilyMember>(
  {
    name: { type: String, trim: true, default: "" },
    relation: { type: String, trim: true, default: "" },
    dateOfBirth: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

export const UploadedDocumentFileSchema = new Schema<IUploadedDocumentFile>(
  {
    fileName: { type: String, trim: true, default: "" },
    fileUrl: { type: String, trim: true, default: "" },
    mimeType: { type: String, trim: true },
    uploadedAt: { type: String, trim: true },
  },
  { _id: false }
);

export const PreviousEsiPfDocumentSchema = new Schema<
  IUploadedDocumentFile & { esiNumber?: string; pfNumber?: string }
>(
  {
    fileName: { type: String, trim: true, default: "" },
    fileUrl: { type: String, trim: true, default: "" },
    mimeType: { type: String, trim: true },
    uploadedAt: { type: String, trim: true },
    esiNumber: { type: String, trim: true, maxlength: 100 },
    pfNumber: { type: String, trim: true, maxlength: 100 },
  },
  { _id: false }
);

export const AcademicQualificationDocsSchema = new Schema<IAcademicQualificationDocs>(
  {
    "10th": { type: UploadedDocumentFileSchema },
    "12th": { type: UploadedDocumentFileSchema },
    Graduation: { type: UploadedDocumentFileSchema },
    Masters: { type: UploadedDocumentFileSchema },
  },
  { _id: false }
);

export const CandidateDocumentsSchema = new Schema<ICandidateDocuments>(
  {
    aadharCard: { type: UploadedDocumentFileSchema },
    panCard: { type: UploadedDocumentFileSchema },
    bankDetails: { type: UploadedDocumentFileSchema },
    voterId: { type: UploadedDocumentFileSchema },
    academicQualification: { type: AcademicQualificationDocsSchema },
    colorPhoto: { type: UploadedDocumentFileSchema },
    pcc: { type: UploadedDocumentFileSchema },
    mfc: { type: UploadedDocumentFileSchema },
    characterCertificate: { type: UploadedDocumentFileSchema },
    previousEsiPf: { type: PreviousEsiPfDocumentSchema },
    previousExperienceProof: { type: UploadedDocumentFileSchema },
    otherDocument: { type: UploadedDocumentFileSchema },
  },
  { _id: false }
);
