export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type PropertyRow = {
  id: string;
  bag_vbo_id: string;
  address_label: string;
  postcode: string;
  house_number: string;
  house_number_addition: string | null;
  city: string;
  lat: number;
  lng: number;
  rd_x: number | null;
  rd_y: number | null;
  area_m2: number | null;
  build_year: number | null;
  created_at: string;
  updated_at: string;
};

type EvidenceRow = {
  id: string;
  property_id: string;
  source: string;
  source_record_id: string | null;
  source_url: string;
  source_updated_at: string | null;
  fetched_at: string;
  spatial_resolution: string | null;
  confidence: string;
  caveat: string | null;
  raw_json: Json | null;
};

type AnalysisRow = {
  id: string;
  property_id: string;
  analysis_version: string;
  scoring_version: string;
  overall_score: number;
  components_json: Json;
  created_at: string;
};

export type AiReportRow = {
  id: string;
  property_id: string;
  report_version: string;
  prompt_version: string;
  input_fingerprint: string;
  status: string;
  report_json: Json | null;
  source_manifest_json: Json | null;
  research_model: string | null;
  synthesis_model: string | null;
  usage_json: Json | null;
  error_code: string | null;
  generated_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type PurchaseCaseRow = {
  id: string;
  user_id: string;
  property_id: string | null;
  title: string;
  stage: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type CaseTaskRow = {
  id: string;
  case_id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  due_at: string | null;
  priority: string;
  source: string | null;
  created_at: string;
  updated_at: string;
};

type CaseDocumentRow = {
  id: string;
  case_id: string;
  user_id: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  document_type: string;
  status: string;
  extracted_json: Json | null;
  created_at: string;
  updated_at: string;
};

type DocumentFindingRow = {
  id: string;
  document_id: string;
  case_id: string;
  user_id: string;
  title: string;
  summary: string;
  severity: string;
  page_number: number | null;
  action: string | null;
  status: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  preferences_json: Json;
  compare_ids: Json;
  created_at: string;
  updated_at: string;
};

export type SavedPropertyRow = {
  user_id: string;
  bag_vbo_id: string;
  address_label: string;
  postcode: string;
  city: string;
  stage: string;
  saved_at: string;
  updated_at: string;
};

export type PropertyChecklistRow = {
  user_id: string;
  bag_vbo_id: string;
  items_json: Json;
  updated_at: string;
};

export type PropertyBidDraftRow = {
  id: string;
  user_id: string;
  bag_vbo_id: string;
  asking_price: number | null;
  selected_scenario: string;
  updated_at: string;
};

export type CaseFinanceRow = {
  id: string;
  case_id: string;
  user_id: string;
  maximum_price: number | null;
  own_funds: number | null;
  financing_amount: number | null;
  financing_status: string;
  transfer_preference: string | null;
  created_at: string;
  updated_at: string;
};

export type ComparableSaleRow = {
  id: string;
  case_id: string;
  user_id: string;
  address_label: string;
  sale_price: number;
  sale_date: string | null;
  area_m2: number | null;
  distance_m: number | null;
  source: string;
  source_url: string | null;
  created_at: string;
};

export type ValuationSnapshotRow = {
  id: string;
  case_id: string;
  user_id: string;
  version: number;
  low_value: number | null;
  midpoint_value: number | null;
  high_value: number | null;
  methodology: Json;
  created_at: string;
};

export type BidDraftRow = {
  id: string;
  case_id: string;
  user_id: string;
  version: number;
  amount: number | null;
  transfer_date: string | null;
  conditions: Json;
  body: string;
  status: string;
  created_at: string;
};

export type CaseEventRow = {
  id: string;
  case_id: string;
  user_id: string;
  event_type: string;
  payload: Json;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      properties: Table<PropertyRow>;
      property_buildings: Table<{ id: string; property_id: string; bag_pand_id: string; is_primary: string }>;
      source_cache: Table<{ id: string; source: string; cache_key: string; payload_json: Json; etag: string | null; source_updated_at: string | null; fetched_at: string; expires_at: string | null; schema_version: string }>;
      evidence: Table<EvidenceRow>;
      analyses: Table<AnalysisRow>;
      ai_reports: Table<AiReportRow>;
      profiles: Table<ProfileRow>;
      purchase_cases: Table<PurchaseCaseRow>;
      case_tasks: Table<CaseTaskRow>;
      case_documents: Table<CaseDocumentRow>;
      document_findings: Table<DocumentFindingRow>;
      saved_properties: Table<SavedPropertyRow>;
      property_checklists: Table<PropertyChecklistRow>;
      property_bid_drafts: Table<PropertyBidDraftRow>;
      case_finance: Table<CaseFinanceRow>;
      comparable_sales: Table<ComparableSaleRow>;
      valuation_snapshots: Table<ValuationSnapshotRow>;
      bid_drafts: Table<BidDraftRow>;
      notification_preferences: Table<{ user_id: string; email_enabled: boolean; deadline_reminders: boolean; updated_at: string }>;
      case_events: Table<CaseEventRow>;
    };
    Views: Record<string, never>;
    Functions: {
      merge_profile_preferences: {
        Args: { p_preferences?: Json | null; p_buyer_profile?: Json | null; p_compare_ids?: Json | null };
        Returns: Json;
      };
      apply_case_workflow: {
        Args: { p_case_id: string; p_payload: Json };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type PurchaseCase = PurchaseCaseRow;
export type CaseTask = CaseTaskRow;
export type CaseDocument = CaseDocumentRow;
export type DocumentFinding = DocumentFindingRow;
