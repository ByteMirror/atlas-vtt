import { useEffect, useState } from 'react';

/** An object URL for `blob` while it is shown; revoked when the blob changes or the component unmounts. */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return undefined;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return (): void => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
