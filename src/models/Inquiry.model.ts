import mongoose, { Schema, Document, Model } from "mongoose";

// ─── Lifecycle Stages Enum ─────────────────────────────────
export type LifecycleStage =
  | "lead"
  | "qualified"
  | "meeting_scheduled"
  | "site_survey_scheduled"
  | "site_survey_completed"
  | "quotation_drafted"
  | "quotation_delivered"
  | "negotiation"
  | "contract_won"
  | "contract_lost"
  | "mobilisation"
  | "active_deployment"
  | "monthly_attendance"
  | "invoicing"
  | "collection"
  | "renewal";

export const LIFECYCLE_STAGES: LifecycleStage[] = [
  "lead",
  "qualified",
  "meeting_scheduled",
  "site_survey_scheduled",
  "site_survey_completed",
  "quotation_drafted",
  "quotation_delivered",
  "negotiation",
  "contract_won",
  "contract_lost",
  "mobilisation",
  "active_deployment",
  "monthly_attendance",
  "invoicing",
  "collection",
  "renewal",
];

export interface IStageHistoryItem {
  stage: LifecycleStage;
  enteredAt: Date;
  changedBy: string;
  notes?: string;
}

// ─── Interface ─────────────────────────────────────────────
export interface IInquiry extends Document {
  // Stable Entity Taxonomy IDs (Blueprint §13)
  leadId?: string;           // e.g. ACS-2026-X492A
  clientId?: string;         // e.g. CLI-7821 (Corporate Account)
  branchId?: string;         // e.g. BRN-KOL-01 (Physical site/facility)
  opportunityId?: string;    // e.g. OPP-2026-901
  contractId?: string;       // e.g. CON-2026-084 (Awarded legal contract)
  deploymentId?: string;     // e.g. DEP-2026-042 (Active guard post unit)

  // Client Details (PII Minimized)
  name: string;
  organization?: string;
  email: string;
  phone: string;
  service: string;
  city?: string;
  siteType?: string;
  numberOfPosts?: string;
  shiftCoverage?: string;
  startDate?: string;
  manpowerCount?: number;
  duration?: string;
  message?: string;

  // Enterprise Lifecycle Stage
  stage: LifecycleStage;
  status: string;            // Legacy compatibility string

  // Operational Accountability & SLAs
  assignedOwner?: string;    // e.g. Debabrata Sen / Amitabh Roy
  ownerDesk?: string;        // e.g. Eastern Industrial Desk
  ownerEmail?: string;
  slaTarget?: string;        // e.g. Within 4 Hours / 24 Hours
  followUpDeadline?: Date;
  isSlaBreached?: boolean;

  // Commercial & Deployment Values
  contractValueMonthlyINR?: number;
  contractValueAnnualINR?: number;
  paymentCreditDays?: number; // 30, 45, 60
  headcountDeployed?: number;
  assignedSupervisor?: string;
  lostReason?: string;

  // Audit Trail & Metadata
  stageHistory: IStageHistoryItem[];
  statutoryResponsibility?: string;
  operatingModel?: "direct_psara" | "partner_network";
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  landingUrl?: string;
  ipAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ────────────────────────────────────────────────
const StageHistoryItemSchema = new Schema<IStageHistoryItem>(
  {
    stage:     { type: String, required: true, enum: LIFECYCLE_STAGES },
    enteredAt: { type: Date, default: Date.now },
    changedBy: { type: String, required: true, trim: true },
    notes:     { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false }
);

const InquirySchema = new Schema<IInquiry>(
  {
    // Stable Taxonomy IDs
    leadId:        { type: String, trim: true, index: true },
    clientId:      { type: String, trim: true, index: true },
    branchId:      { type: String, trim: true, index: true },
    opportunityId: { type: String, trim: true, index: true },
    contractId:    { type: String, trim: true, index: true },
    deploymentId:  { type: String, trim: true, index: true },

    name:          { type: String, required: true, trim: true, maxlength: 200 },
    organization:  { type: String, trim: true, maxlength: 200 },
    email:         { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone:         { type: String, required: true, trim: true, maxlength: 20 },
    service:       { type: String, required: true, trim: true, maxlength: 150 },
    city:          { type: String, trim: true, maxlength: 100 },
    siteType:      { type: String, trim: true, maxlength: 150 },
    numberOfPosts: { type: String, trim: true },
    shiftCoverage: { type: String, trim: true },
    startDate:     { type: String, trim: true },
    manpowerCount: { type: Number, min: 1 },
    duration:      { type: String, trim: true, maxlength: 100 },
    message:       { type: String, trim: true, maxlength: 5000 },

    stage: {
      type: String,
      enum: LIFECYCLE_STAGES,
      default: "lead",
      index: true,
    },
    status: {
      type: String,
      default: "lead",
    },

    assignedOwner:    { type: String, trim: true },
    ownerDesk:        { type: String, trim: true },
    ownerEmail:       { type: String, trim: true },
    slaTarget:        { type: String, trim: true },
    followUpDeadline: { type: Date },
    isSlaBreached:    { type: Boolean, default: false },

    contractValueMonthlyINR: { type: Number, min: 0 },
    contractValueAnnualINR:  { type: Number, min: 0 },
    paymentCreditDays:       { type: Number, min: 0, max: 180 },
    headcountDeployed:       { type: Number, min: 0 },
    assignedSupervisor:      { type: String, trim: true },
    lostReason:              { type: String, trim: true },

    stageHistory: [StageHistoryItemSchema],

    statutoryResponsibility: { type: String, trim: true },
    operatingModel:          { type: String, enum: ["direct_psara", "partner_network"] },
    utmSource:               { type: String, trim: true },
    utmMedium:               { type: String, trim: true },
    utmCampaign:             { type: String, trim: true },
    landingUrl:              { type: String, trim: true },
    ipAddress:               { type: String },
  },
  {
    timestamps: true,
    collection: "inquiries",
  }
);

InquirySchema.index({ stage: 1, createdAt: -1 });
InquirySchema.index({ assignedOwner: 1, stage: 1 });
InquirySchema.index({ service: 1 });

export const Inquiry: Model<IInquiry> =
  mongoose.models.Inquiry ||
  mongoose.model<IInquiry>("Inquiry", InquirySchema);
