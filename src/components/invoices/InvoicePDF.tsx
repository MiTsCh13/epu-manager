// Rechnungs-PDF (A4) mit @react-pdf/renderer. Wird nur per dynamischem Import geladen (große Bibliothek).
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { InvoicePdfData } from '@/lib/invoicePdf';

const PRIMARY = '#0f766e';
const TEXT = '#1e293b';
const MUTED = '#64748b';
const LINE = '#e2e8f0';

const s = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 80, paddingHorizontal: 56, fontFamily: 'Helvetica', fontSize: 9.5, color: TEXT, lineHeight: 1.4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 36 },
  issuerName: { fontFamily: 'Helvetica-Bold', fontSize: 14, color: PRIMARY },
  issuerLines: { textAlign: 'right', color: MUTED, fontSize: 8.5 },
  // Empfängerfeld auf Höhe eines Fensterkuverts (DIN 5008)
  addressRow: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 110 },
  addressBox: { width: 240 },
  senderLine: { fontSize: 7, color: MUTED, borderBottomWidth: 0.5, borderBottomColor: MUTED, paddingBottom: 2, marginBottom: 6 },
  recipientName: { fontFamily: 'Helvetica-Bold' },
  metaBox: { width: 190 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  metaLabel: { color: MUTED },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 16, marginTop: 24, marginBottom: 14 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: TEXT, paddingBottom: 4, fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 5 },
  colPos: { width: 22, color: MUTED },
  colDesc: { flex: 1, paddingRight: 8 },
  colQty: { width: 50, textAlign: 'right' },
  colPrice: { width: 80, textAlign: 'right' },
  colTotal: { width: 80, textAlign: 'right' },
  totals: { marginTop: 10, marginLeft: 'auto', width: 210 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: TEXT, marginTop: 4, paddingTop: 5, fontFamily: 'Helvetica-Bold', fontSize: 11 },
  block: { marginTop: 18 },
  taxNote: { marginTop: 18, fontFamily: 'Helvetica-Oblique' },
  payment: { marginTop: 14, padding: 10, backgroundColor: '#f0fdfa', borderLeftWidth: 2, borderLeftColor: PRIMARY, flexDirection: 'row', justifyContent: 'space-between' },
  paymentRow: { flexDirection: 'row', marginTop: 2 },
  paymentLabel: { width: 95, color: MUTED },
  paymentValue: { fontFamily: 'Helvetica-Bold' },
  qrBox: { width: 78, alignItems: 'center', marginLeft: 12 },
  qr: { width: 70, height: 70 },
  qrCaption: { fontSize: 6.5, color: MUTED, marginTop: 2, textAlign: 'center' },
  footer: { position: 'absolute', bottom: 28, left: 56, right: 56, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6, fontSize: 7.5, color: MUTED, textAlign: 'center' },
  draft: { position: 'absolute', top: 330, left: 0, right: 0, textAlign: 'center', fontSize: 90, fontFamily: 'Helvetica-Bold', color: '#e2e8f0', transform: 'rotate(-30deg)' },
});

/** `qrDataUrl`: PNG des EPC-QR-Codes (asynchron erzeugt, siehe renderInvoicePdf). */
export function InvoicePDF({ data, qrDataUrl }: { data: InvoicePdfData; qrDataUrl?: string | null }) {
  return (
    <Document title={`${data.title} ${data.meta[0]?.[1] ?? ''}`} author={data.issuerName} creator="Klaro" producer="Klaro" language="de-AT">
      <Page size="A4" style={s.page}>
        {data.isDraft && (
          <Text style={s.draft} fixed>
            ENTWURF
          </Text>
        )}

        <View style={s.header}>
          <Text style={s.issuerName}>{data.issuerName}</Text>
          <View>
            {data.issuerLines.map((l) => (
              <Text key={l} style={s.issuerLines}>
                {l}
              </Text>
            ))}
          </View>
        </View>

        <View style={s.addressRow}>
          <View style={s.addressBox}>
            <Text style={s.senderLine}>{data.senderLine}</Text>
            {data.recipientLines.map((l, i) => (
              <Text key={`${i}-${l}`} style={i === 0 ? s.recipientName : undefined}>
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

        <Text style={s.title}>
          {data.title} {data.meta[0]?.[1]}
        </Text>

        <View style={s.tableHead} fixed>
          <Text style={s.colPos}>Pos.</Text>
          <Text style={s.colDesc}>Bezeichnung</Text>
          <Text style={s.colQty}>Menge</Text>
          <Text style={s.colPrice}>Einzelpreis</Text>
          <Text style={s.colTotal}>Betrag</Text>
        </View>
        {data.items.map((it, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={s.colPos}>{i + 1}</Text>
            <Text style={s.colDesc}>{it.description}</Text>
            <Text style={s.colQty}>{it.quantity}</Text>
            <Text style={s.colPrice}>{it.unitPrice}</Text>
            <Text style={s.colTotal}>{it.total}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          {data.totals.map(([k, v]) => (
            <View key={k} style={s.totalRow}>
              <Text>{k}</Text>
              <Text>{v}</Text>
            </View>
          ))}
          <View style={s.grandTotal}>
            <Text>Gesamtbetrag</Text>
            <Text>{data.grandTotal}</Text>
          </View>
        </View>

        {data.taxNote && <Text style={s.taxNote}>{data.taxNote}</Text>}
        {data.notes && <Text style={s.block}>{data.notes}</Text>}
        {data.payment && (
          <View style={s.payment} wrap={false}>
            <View style={{ flex: 1 }}>
              <Text>{data.payment.intro}</Text>
              {data.payment.rows.map(([k, v]) => (
                <View key={k} style={s.paymentRow}>
                  <Text style={s.paymentLabel}>{k}</Text>
                  <Text style={s.paymentValue}>{v}</Text>
                </View>
              ))}
            </View>
            {qrDataUrl && (
              <View style={s.qrBox}>
                <Image src={qrDataUrl} style={s.qr} />
                <Text style={s.qrCaption}>Zahlen mit Code</Text>
              </View>
            )}
          </View>
        )}
        {data.footerText && <Text style={[s.block, { color: MUTED }]}>{data.footerText}</Text>}

        <View style={s.footer} fixed>
          {data.footerLines.map((l) => (
            <Text key={l}>{l}</Text>
          ))}
        </View>
      </Page>
    </Document>
  );
}
