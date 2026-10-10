// Rechnungs-PDF (A4) mit @react-pdf/renderer. Wird nur per dynamischem Import geladen (große Bibliothek).
// Die Gestaltung kommt aus der Vorlage (data.template); Empfängerfeld, Rechnungsangaben und Pflichtangaben
// stehen bei jedem Design an derselben Stelle (Fensterkuvert, § 11 UStG).
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import type { InvoicePdfData } from '@/lib/invoicePdf';
import { tint, type RichBlock, type Segment } from '@/lib/invoiceTemplates';
import { FONT_FAMILY } from './pdfFonts';

const TEXT = '#1e293b';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const MARGIN = 56;
const PAGE_WIDTH = 595.28;

export interface PdfImages {
  header?: string | null; // Kopfbild (URL oder data:)
  logo?: string | null;
}

const LOGO_HEIGHT = { s: 34, m: 50, l: 70 } as const;
const FOOTER_LINE = 7.5 * 1.4; // Schriftgröße × Zeilenhöhe der Fußzeile

/** Platz unten auf jeder Seite, damit der Inhalt nie unter der festen Fußzeile verschwindet. */
function footerSpace(data: InvoicePdfData): number {
  if (data.footerColumns) return 24 + 16 + Math.max(1, ...data.footerColumns.map((c) => c.length)) * FOOTER_LINE + 18;
  // Zeilen: lange Zeilen brechen um (ca. 120 Zeichen pro Zeile)
  const lines = data.footerLines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 120)), 0);
  return 28 + 6 + lines * FOOTER_LINE + 18;
}

/** Text in etwa: so viele Zeichen passen auf eine halbe Seite. Längeres darf über Seiten umbrechen. */
const blockLength = (blocks: RichBlock[]) =>
  blocks.reduce((n, b) => n + (b.kind === 'paragraph' ? b.segments : b.items.flat()).reduce((m, seg) => m + seg.text.length, 0), 0);

const s = StyleSheet.create({
  page: { paddingTop: 42, paddingHorizontal: MARGIN, fontSize: 9.5, color: TEXT, lineHeight: 1.4 },
  bold: { fontWeight: 'bold' },
  // ─ Kopf ─
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36 },
  issuerName: { fontWeight: 'bold', fontSize: 14 },
  tagline: { color: MUTED, fontSize: 8.5, marginTop: 1 },
  issuerLines: { color: MUTED, fontSize: 8.5 },
  centered: { alignItems: 'center', marginBottom: 30, paddingBottom: 10, borderBottomWidth: 1 },
  band: { marginTop: -42, marginHorizontal: -MARGIN, paddingHorizontal: MARGIN, paddingVertical: 22, marginBottom: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  imageHeader: { marginTop: -42, marginHorizontal: -MARGIN, width: PAGE_WIDTH, height: 165, marginBottom: 26, position: 'relative' },
  // ─ Empfänger + Rechnungsangaben (Fensterkuvert, DIN 5008) ─
  addressRow: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 110 },
  addressBox: { width: 230 },
  senderLine: { fontSize: 7, color: MUTED, borderBottomWidth: 0.5, borderBottomColor: MUTED, paddingBottom: 2, marginBottom: 6 },
  metaBox: { width: 215 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  metaLabel: { color: MUTED, marginRight: 8 },
  title: { fontWeight: 'bold', fontSize: 16, marginTop: 24, marginBottom: 10 },
  // ─ Positionen ─
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, paddingBottom: 4, marginTop: 4, fontWeight: 'bold', fontSize: 8.5 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 5 },
  colPos: { width: 22, color: MUTED },
  colDesc: { flex: 1, paddingRight: 8 },
  colQty: { width: 50, textAlign: 'right' },
  colPrice: { width: 88, textAlign: 'right' },
  colTotal: { width: 80, textAlign: 'right' },
  bulletRow: { flexDirection: 'row', marginTop: 2 },
  bullet: { width: 9 },
  totals: { marginTop: 10, marginLeft: 'auto', width: 210 },
  totalsWide: { marginTop: 6, width: '100%' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, marginTop: 4, paddingTop: 5, fontWeight: 'bold', fontSize: 11 },
  // ─ Texte ─
  block: { marginTop: 14 },
  paragraph: { marginBottom: 5 },
  listItem: { flexDirection: 'row', marginBottom: 2 },
  taxNote: { marginTop: 14, fontStyle: 'italic' },
  box: { marginTop: 22, paddingVertical: 12, paddingHorizontal: 14 },
  boxTitle: { fontWeight: 'bold', fontSize: 11, marginBottom: 6 },
  payment: { marginTop: 14, padding: 10, borderLeftWidth: 2, flexDirection: 'row', justifyContent: 'space-between' },
  paymentRow: { flexDirection: 'row', marginTop: 2 },
  paymentLabel: { width: 95, color: MUTED },
  qrBox: { width: 78, alignItems: 'center', marginLeft: 12 },
  qr: { width: 70, height: 70 },
  qrCaption: { fontSize: 6.5, color: MUTED, marginTop: 2, textAlign: 'center' },
  greeting: { marginTop: 22 },
  // ─ Fußzeile ─
  footer: { position: 'absolute', bottom: 28, left: MARGIN, right: MARGIN, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6, fontSize: 7.5, color: MUTED, textAlign: 'center' },
  footerColumns: { position: 'absolute', bottom: 24, left: MARGIN, right: MARGIN, flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, fontSize: 7.5 },
  footerColumn: { flex: 1, paddingRight: 8 },
  draft: { position: 'absolute', top: 330, left: 0, right: 0, textAlign: 'center', fontSize: 90, fontWeight: 'bold', color: '#e2e8f0', transform: 'rotate(-30deg)' },
});

function Segments({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((seg, i) => (
        <Text key={i} style={{ ...(seg.bold && { fontWeight: 'bold' }), ...(seg.italic && { fontStyle: 'italic' }) }}>
          {seg.text}
        </Text>
      ))}
    </>
  );
}

function Rich({ blocks, style }: { blocks: RichBlock[]; style?: Style }) {
  return (
    <View style={style}>
      {blocks.map((b, i) =>
        b.kind === 'paragraph' ? (
          <Text key={i} style={s.paragraph}>
            <Segments segments={b.segments} />
          </Text>
        ) : (
          <View key={i} style={s.paragraph}>
            {b.items.map((item, j) => (
              <View key={j} style={s.listItem}>
                <Text style={s.bullet}>•</Text>
                <Text style={{ flex: 1 }}>
                  <Segments segments={item} />
                </Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}

function Logo({ src, size }: { src: string; size: keyof typeof LOGO_HEIGHT }) {
  // Höhe fix, Breite ergibt sich aus dem Seitenverhältnis (höchstens die halbe Seite)
  return <Image src={src} style={{ height: LOGO_HEIGHT[size], maxWidth: 240, objectFit: 'contain' }} />;
}

function Header({ data, images }: { data: InvoicePdfData; images: PdfImages }) {
  const { header, color } = data.template;
  const logo = images.logo && header.logoPath ? images.logo : null;
  const nameBlock = (light = false) => (
    <View>
      <Text style={[s.issuerName, { color: light ? '#ffffff' : color }]}>{data.issuerName}</Text>
      {header.tagline && <Text style={[s.tagline, light ? { color: '#ffffff' } : {}]}>{header.tagline}</Text>}
    </View>
  );
  const lines = (light = false, align: 'left' | 'right' | 'center' = 'right') =>
    data.issuerLines.map((l) => (
      <Text key={l} style={[s.issuerLines, { textAlign: align }, light ? { color: '#ffffff' } : {}]}>
        {l}
      </Text>
    ));

  if (header.style === 'image') {
    const justify = header.logoPosition === 'left' ? 'flex-start' : header.logoPosition === 'right' ? 'flex-end' : 'center';
    return (
      <View style={[s.imageHeader, images.header ? {} : { backgroundColor: color }]}>
        {images.header && <Image src={images.header} style={{ position: 'absolute', top: 0, left: 0, width: PAGE_WIDTH, height: 165, objectFit: 'cover' }} />}
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: MARGIN - 10, right: MARGIN - 10, flexDirection: 'row', alignItems: 'center', justifyContent: justify }}>
          {logo ? <Logo src={logo} size={header.logoSize === 's' ? 'm' : 'l'} /> : !images.header && nameBlock(true)}
        </View>
      </View>
    );
  }
  if (header.style === 'band') {
    return (
      <View style={[s.band, { backgroundColor: color }]}>
        {logo ? <Logo src={logo} size={header.logoSize} /> : nameBlock(true)}
        <View>{lines(true)}</View>
      </View>
    );
  }
  if (header.style === 'centered') {
    return (
      <View style={[s.centered, { borderBottomColor: color }]}>
        {logo ? <Logo src={logo} size={header.logoSize} /> : <Text style={[s.issuerName, { color, fontSize: 16 }]}>{data.issuerName}</Text>}
        {header.tagline && <Text style={[s.tagline, { textAlign: 'center' }]}>{header.tagline}</Text>}
        {data.issuerLines.length > 0 && <Text style={[s.issuerLines, { marginTop: 4, textAlign: 'center' }]}>{data.issuerLines.join(' · ')}</Text>}
      </View>
    );
  }
  // Klassisch mit Logo rechts: Logo über der Anschrift (links bleibt frei bzw. steht der Zusatz)
  if (logo && header.logoPosition === 'right') {
    return (
      <View style={s.header}>
        <View>{header.tagline && <Text style={s.tagline}>{header.tagline}</Text>}</View>
        <View style={{ alignItems: 'flex-end' }}>
          <Logo src={logo} size={header.logoSize} />
          {data.issuerLines.length > 0 && <View style={{ marginTop: 8 }}>{lines()}</View>}
        </View>
      </View>
    );
  }
  // Klassisch: Logo bzw. Name auf der einen Seite, ggf. Inhaber auf der anderen
  const brand = logo ? <Logo src={logo} size={header.logoSize} /> : nameBlock();
  const address = <View>{lines(false, header.logoPosition === 'right' ? 'left' : 'right')}</View>;
  return (
    <View style={s.header}>
      {header.logoPosition === 'right' ? address : brand}
      {header.logoPosition === 'right' ? brand : address}
    </View>
  );
}

/** `qrDataUrl`: PNG des EPC-QR-Codes (asynchron erzeugt, siehe renderInvoicePdf). `images`: Logo und Kopfbild der Vorlage. */
export function InvoicePDF({ data, qrDataUrl, images = {} }: { data: InvoicePdfData; qrDataUrl?: string | null; images?: PdfImages }) {
  const t = data.template;
  const color = t.color;
  const columns = !!data.footerColumns;
  const priceFirst = t.table.priceFirst;
  const qtyHead = (
    <Text key="q" style={s.colQty}>
      Menge
    </Text>
  );
  const priceHead = (
    <Text key="p" style={s.colPrice}>
      {priceFirst ? 'Preis' : 'Einzelpreis'}
    </Text>
  );
  return (
    <Document title={`${data.title} ${data.meta[0]?.[1] ?? ''}`} author={data.issuerName} creator="Klaro" producer="Klaro" language="de-AT">
      <Page size="A4" style={[s.page, { fontFamily: FONT_FAMILY[t.font], paddingBottom: Math.max(columns ? 110 : 80, footerSpace(data)) }]}>
        {data.isDraft && (
          <Text style={s.draft} fixed>
            ENTWURF
          </Text>
        )}

        <Header data={data} images={images} />

        <View style={s.addressRow}>
          <View style={s.addressBox}>
            <Text style={s.senderLine}>{data.senderLine}</Text>
            {data.recipientLines.map((l, i) => (
              <Text key={`${i}-${l}`} style={i === 0 ? s.bold : undefined}>
                {l}
              </Text>
            ))}
          </View>
          <View style={s.metaBox}>
            {data.meta.map(([k, v]) => (
              <View key={k} style={s.metaRow}>
                <Text style={s.metaLabel}>{k}</Text>
                <Text>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={[s.title, { color }]}>
          {data.title} {data.meta[0]?.[1]}
        </Text>
        {data.intro.length > 0 && <Rich blocks={data.intro} style={{ marginBottom: 8 }} />}

        {/* Tabellenkopf wiederholt sich nur auf Seiten mit Positionen */}
        <View>
          <View style={[s.tableHead, { borderBottomColor: color, color }]} fixed>
            <Text style={s.colPos}>Pos.</Text>
            <Text style={s.colDesc}>Bezeichnung</Text>
            {priceFirst ? [priceHead, qtyHead] : [qtyHead, priceHead]}
            <Text style={s.colTotal}>{priceFirst ? 'Gesamtpreis' : 'Betrag'}</Text>
          </View>
          {data.items.map((it, i) => {
            const qty = (
              <Text key="q" style={s.colQty}>
                {it.quantity}
              </Text>
            );
            const price = (
              <Text key="p" style={s.colPrice}>
                {it.unitPrice}
              </Text>
            );
            const [first, ...rest] = it.lines.length ? it.lines : [{ text: it.description, bullet: false }];
            return (
              // Kurze Positionen nicht trennen; sehr lange dürfen über Seiten laufen statt abgeschnitten zu werden
              <View key={i} style={s.row} wrap={it.lines.length > 12}>
                <Text style={s.colPos}>{i + 1}</Text>
                <View style={s.colDesc}>
                  <Text>{first?.text}</Text>
                  {rest.map((l, j) =>
                    l.bullet ? (
                      <View key={j} style={s.bulletRow}>
                        <Text style={s.bullet}>•</Text>
                        <Text style={{ flex: 1 }}>{l.text}</Text>
                      </View>
                    ) : (
                      <Text key={j}>{l.text}</Text>
                    ),
                  )}
                </View>
                {priceFirst ? [price, qty] : [qty, price]}
                <Text style={s.colTotal}>{it.total}</Text>
              </View>
            );
          })}
        </View>

        <View style={data.taxNoteInTotals ? s.totalsWide : s.totals} wrap={false}>
          {data.totals.map(([k, v]) => (
            <View key={k} style={s.totalRow}>
              <Text>{k}</Text>
              <Text>{v}</Text>
            </View>
          ))}
          {data.taxNoteInTotals && data.taxNote && (
            <View style={[s.totalRow, { color: MUTED, fontStyle: 'italic' }]}>
              <Text style={{ flex: 1, paddingRight: 12 }}>{data.taxNote}</Text>
              <Text>€ 0,00</Text>
            </View>
          )}
          <View style={[s.grandTotal, { borderTopColor: color, color }]}>
            <Text>Gesamtbetrag</Text>
            <Text>{data.grandTotal}</Text>
          </View>
        </View>

        {!data.taxNoteInTotals && data.taxNote && <Text style={s.taxNote}>{data.taxNote}</Text>}

        {data.closing && (
          <View style={data.closing.boxed ? [s.box, { backgroundColor: tint(color, 0.9) }] : s.block} wrap={blockLength(data.closing.blocks) > 900}>
            {data.closing.title && <Text style={[s.boxTitle, { color }]}>{data.closing.title}</Text>}
            <Rich blocks={data.closing.blocks} />
          </View>
        )}
        {data.paymentTerms && <Text style={s.block}>{data.paymentTerms}</Text>}

        {data.payment && (
          <View style={[s.payment, { backgroundColor: tint(color, 0.93), borderLeftColor: color }]} wrap={false}>
            <View style={{ flex: 1 }}>
              <Text>{data.payment.intro}</Text>
              {data.payment.rows.map(([k, v]) => (
                <View key={k} style={s.paymentRow}>
                  <Text style={s.paymentLabel}>{k}</Text>
                  <Text style={s.bold}>{v}</Text>
                </View>
              ))}
            </View>
            {data.qr && qrDataUrl && (
              <View style={s.qrBox}>
                <Image src={qrDataUrl} style={s.qr} />
                <Text style={s.qrCaption}>Zahlen mit Code</Text>
              </View>
            )}
          </View>
        )}

        {data.greeting && (
          <View style={s.greeting} wrap={false}>
            {data.greeting.text && <Text>{data.greeting.text}</Text>}
            {data.greeting.signature && <Text style={[s.bold, { color }]}>{data.greeting.signature}</Text>}
          </View>
        )}
        {data.footerText && <Text style={[s.block, { color: MUTED }]}>{data.footerText}</Text>}

        {data.footerColumns ? (
          <View
            style={[s.footerColumns, data.footerTinted ? { backgroundColor: tint(color, 0.9), color } : { borderTopWidth: 0.5, borderTopColor: LINE, color: TEXT }]}
            fixed
          >
            {data.footerColumns.map((col, i) => (
              <View key={i} style={s.footerColumn}>
                {col.map((l, j) => (
                  <Text key={j} style={i === 0 && j === 0 ? s.bold : undefined}>
                    {l}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ) : (
          <View style={s.footer} fixed>
            {data.footerLines.map((l) => (
              <Text key={l}>{l}</Text>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}
