import { Link } from 'react-router';

export default function BrandMark() {
  return (
    <Link className="brand-mark" to="/" aria-label="UrbanKart home">
      <span className="brand-mark__icon" aria-hidden="true">u</span>
      <span className="brand-mark__name">urban<span>kart</span></span>
    </Link>
  );
}
