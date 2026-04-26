import type { Response } from "express";

export type PaginationMeta = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export const sendOk = <T>(res: Response, data: T) => {
  return res.status(200).json({ data });
};

export const sendCreated = <T>(res: Response, data: T) => {
  return res.status(201).json({ data });
};

export const sendNoContent = (res: Response) => {
  return res.status(204).send();
};

export const sendPaginated = <T>(res: Response, data: T[], meta: PaginationMeta) => {
  return res.status(200).json({ data, meta });
};
