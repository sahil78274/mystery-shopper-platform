import { Store } from 'lucide-react';

type RicozBrandProps = {
  className?: string;
  subtitle?: string;
};

/** Shared Ricoz wordmark treatment used by public, auth, and workspace screens. */
export function RicozBrand({
  className = '',
  subtitle = 'Mystery shopping platform',
}: RicozBrandProps) {
  return (
    <div className={`brand${className ? ` ${className}` : ''}`}>
      <span className="brand-mark" aria-hidden="true">
        <Store size={19} strokeWidth={2} />
      </span>
      <span className="brand-copy">
        <span className="brand-name">Ricoz</span>
        {subtitle ? <span className="brand-sub">{subtitle}</span> : null}
      </span>
    </div>
  );
}
