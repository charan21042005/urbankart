import PageContainer from '../components/layout/PageContainer.jsx';
import TextLink from '../components/ui/TextLink.jsx';

const principles = [
  {
    number: '01',
    title: 'Useful, first.',
    description: 'The best shopping experience makes the next step feel obvious and keeps the details easy to understand.'
  },
  {
    number: '02',
    title: 'Room for every kind.',
    description: 'A flexible catalog can describe very different products without forcing them into the same shape.'
  },
  {
    number: '03',
    title: 'Thoughtful by default.',
    description: 'Clear information, careful interactions, and honest feedback should be part of every visit.'
  }
];

function EditorialArtwork() {
  return (
    <div className="editorial-art" role="img" aria-label="Abstract geometric UrbanKart brand artwork">
      <div className="editorial-art__orbit editorial-art__orbit--outer" />
      <div className="editorial-art__orbit editorial-art__orbit--inner" />
      <div className="editorial-art__sun" />
      <div className="editorial-art__arch" />
      <div className="editorial-art__caption">
        <span>OBJECTS, IDEAS, EVERYDAY</span>
        <span>EST. FOR WHAT'S NEXT</span>
      </div>
      <span className="editorial-art__index" aria-hidden="true">U—01</span>
    </div>
  );
}

export default function FoundationHome() {
  return (
    <>
      <section className="hero-section" aria-labelledby="hero-title">
        <PageContainer className="hero-layout">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow__rule" /> A MORE CONSIDERED WAY TO SHOP</p>
            <h1 id="hero-title">Everyday,<br /><em>reconsidered.</em></h1>
            <p className="hero-copy__intro">
              A thoughtful new corner of the internet for the things that make daily life feel a little more your own.
            </p>
            <TextLink href="#point-of-view">Get to know us</TextLink>
            <p className="hero-copy__note">A storefront in the making. The catalog arrives in a later build stage.</p>
          </div>
          <div className="hero-visual">
            <EditorialArtwork />
            <div className="visual-stamp">
              <span className="visual-stamp__small">URBANKART</span>
              <span className="visual-stamp__large">A GOOD<br />PLACE TO<br /><em>begin.</em></span>
              <span className="visual-stamp__chapter">DESIGN FOUNDATION <span>—</span> 01</span>
            </div>
          </div>
        </PageContainer>
        <PageContainer className="hero-meta" role="group" aria-label="Project status">
          <span>DESIGNED FOR THE EVERYDAY</span>
          <span>AN URBANKART PREVIEW</span>
          <a href="#point-of-view">SCROLL TO EXPLORE <span aria-hidden="true">↓</span></a>
        </PageContainer>
      </section>

      <section className="principles-section" id="point-of-view" aria-labelledby="principles-title">
        <PageContainer>
          <div className="section-heading">
            <div>
              <p className="eyebrow"><span className="eyebrow__rule" /> THE WAY WE SEE IT</p>
              <h2 id="principles-title">Good design makes<br /><em>room for real life.</em></h2>
            </div>
            <p className="section-heading__aside">
              UrbanKart is being built around clarity, flexibility, and the small moments that make a useful product feel considered.
            </p>
          </div>

          <div className="principle-list">
            {principles.map((principle) => (
              <article className="principle" key={principle.number}>
                <span className="principle__number">{principle.number}</span>
                <h3>{principle.title}</h3>
                <p>{principle.description}</p>
                <span className="principle__mark" aria-hidden="true">↗</span>
              </article>
            ))}
          </div>
        </PageContainer>
      </section>

      <section className="next-section" id="next-chapter" aria-labelledby="next-title">
        <PageContainer className="next-section__inner">
          <div className="next-section__label">
            <span className="status-dot" aria-hidden="true" />
            <span>THE FOUNDATION IS IN PLACE</span>
          </div>
          <div className="next-section__body">
            <h2 id="next-title">The catalog comes<br /><em>in the next chapter.</em></h2>
            <p>
              This preview is the design foundation only. Product browsing and the rest of the shopping experience will connect to UrbanKart's real API in later stages.
            </p>
          </div>
          <span className="next-section__index" aria-hidden="true">02 / 04</span>
        </PageContainer>
      </section>
    </>
  );
}
