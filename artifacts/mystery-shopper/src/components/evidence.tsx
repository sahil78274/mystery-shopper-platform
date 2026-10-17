import { useEffect, useState, type ReactNode } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useGetSubmissionEvidenceFile } from '@workspace/api-client-react';
import type { SubmissionDetail } from '@workspace/api-client-react';
import { formatDate } from '@/lib/format';

export type EvidenceItem = SubmissionDetail['evidence'][number];

/** Loads private evidence through the authenticated API client, then revokes its temporary object URL. */
export function EvidenceCard({
  submissionId,
  item,
  children,
  showDownload = true,
}: {
  submissionId: number;
  item: EvidenceItem;
  children?: ReactNode;
  showDownload?: boolean;
}) {
  const file = useGetSubmissionEvidenceFile(submissionId, item.id);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
    if (!file.data) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(file.data);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file.data]);

  const download = () => {
    if (!file.data) return;
    const url = URL.createObjectURL(file.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = item.fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  return (
    <figure className="evidence-card">
      {file.isLoading ? (
        <div className="notice report-unavailable" role="status">
          <Loader2 size={16} className="spin" />
          <p>Loading photo…</p>
        </div>
      ) : file.isError ? (
        <div className="notice report-unavailable" role="alert">
          <p>Photo could not be loaded.</p>
          <button type="button" className="btn btn-sm" onClick={() => void file.refetch()}>
            Retry
          </button>
        </div>
      ) : objectUrl && !imageError ? (
        <img
          src={objectUrl}
          alt={item.caption || item.fileName}
          loading="lazy"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="notice report-unavailable" role={imageError ? "alert" : "status"}>
          <p>{imageError ? "Preview unavailable. Download the file to inspect it." : "Photo unavailable."}</p>
        </div>
      )}
      <figcaption>
        <strong>{item.fileName}</strong>
        <span>
          {Math.max(1, Math.round(item.byteSize / 1024))} KB · {formatDate(item.createdAt)}
        </span>
        {item.caption ? <span>{item.caption}</span> : null}
        {showDownload ? (
          <button type="button" className="btn btn-sm" onClick={download} disabled={!file.data}>
            <Download size={13} /> Download
          </button>
        ) : null}
        {children}
      </figcaption>
    </figure>
  );
}
