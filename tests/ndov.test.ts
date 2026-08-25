import assert from "node:assert/strict";
import test from "node:test";
import { ndovCatalogFileCandidates, ndovStopCoordinates } from "@/src/lib/sources/ndov";

test("selects the actual NDOV stop catalog instead of a similarly named assignment export", () => {
  const index = `
    <a href="ExportCHB_2026-08-14.xml.gz">stops</a>
    <a href="PassengerStopAssignmentExportCHB_2026-08-15.xml.gz">assignments</a>
    <a href="ExportCHB_2026-08-15.xml.gz">stops</a>
  `;

  const [newest] = ndovCatalogFileCandidates(index);
  assert.deepEqual(newest, {
    file: "ExportCHB_2026-08-15.xml.gz",
    date: "2026-08-15",
  });
});

test("reads RD coordinates from namespaced NDOV quay data", () => {
  const xml = `
    <ns1:quaylocationdata>
      <ns1:rd-x>92449</ns1:rd-x>
      <ns1:rd-y>436304</ns1:rd-y>
    </ns1:quaylocationdata>
  `;

  const [coordinates] = ndovStopCoordinates(xml);
  assert.ok(coordinates);
  assert.ok(Math.abs(coordinates.lat - 51.9152) < 0.01);
  assert.ok(Math.abs(coordinates.lng - 4.4781) < 0.01);
});
