// types.ts

export type StoreOpeningStep = "shop" | "initial" | "photos" | "cash_check";
export interface CashDiscrepancyData {
  amount: number | string;
  type: "+" | "-";
}

export type OpeningFollowupField = {
  id: string;
  type: "text" | "number";
  label: string;
  required: boolean;
};

export type OpeningStep =
  | {
      id: string;
      type: "photo";
      title: string;
      description: string;
      required: boolean;
      max_photos: number;
    }
  | {
      id: string;
      type: "question";
      title: string;
      required: boolean;
      options: string[];
      followups?: Array<{ when_option: string; fields: OpeningFollowupField[] }>;
    }
  | {
      id: string;
      type: "text";
      title: string;
      description?: string;
      required: boolean;
    };

export type OpeningPointConfig = {
  version: 1;
  setup_completed: boolean;
  title: string;
  photo_storage: {
    mode: "platform" | "external";
    external_folder_url?: string;
    external_hint?: string;
  };
  steps: OpeningStep[];
};

export type OpeningAnswer = {
  step_id: string;
  photo_ids?: string[];
  option?: string;
  followup?: Record<string, string | number>;
  text?: string;
};
