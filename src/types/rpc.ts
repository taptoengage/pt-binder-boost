// src/types/rpc.ts
export type GetTrainerBusySlot = {
  session_date: string; // ISO UTC
  status: string;
};

export type GetTrainerBusySlotsArgs = {
  p_trainer_id: string;
  p_start_date: string; // ISO UTC
  p_end_date: string;   // ISO UTC
};
