import { create } from "zustand";

export type DataSource = "DB" | "ELVATOR";

export type DataSourceMeta = {
  source: DataSource;
  aiAvailable: boolean;
};

type DataSourceStoreState = {
  dataSource: DataSource;
  aiAvailable: boolean;
  setMeta: (meta: DataSourceMeta) => void;
};

export const useDataSourceStore = create<DataSourceStoreState>((set) => ({
  dataSource: "DB" as DataSource,
  aiAvailable: false,
  setMeta: (meta) =>
    set((state) => {
      if (
        state.dataSource === meta.source &&
        state.aiAvailable === meta.aiAvailable
      ) {
        return state;
      }
      return {
        dataSource: meta.source,
        aiAvailable: meta.aiAvailable,
      };
    }),
}));
