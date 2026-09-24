import { createContext, useContext } from 'react';

/** The dialog pane that scrolls; virtual lists inside it render only the rows it shows. */
export const TransferScrollContext = createContext<HTMLElement | null>(null);

export const useTransferScroller = (): HTMLElement | null => useContext(TransferScrollContext);
