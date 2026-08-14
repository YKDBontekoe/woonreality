import type { Geometry } from "geojson";
import type { GeoJsonFeature, Property } from "@/src/lib/types";
import { getJson, pdokBagAddressUrl, pdokBagFeatureUrl, pdokBagVboSearchUrl } from "@/src/lib/sources/pdok/client";

type AddressFeature = GeoJsonFeature & {
  properties: {
    adresseerbaar_object_identificatie?: string;
    huisnummer?: string | number;
    huisletter?: string | null;
    toevoeging?: string | null;
    openbare_ruimte_naam?: string;
    postcode?: string;
    woonplaats_naam?: string;
    provincie_naam?: string;
  };
};

type VboFeature = GeoJsonFeature & {
  properties: {
    identificatie?: string;
    huisnummer?: number;
    huisletter?: string | null;
    toevoeging?: string | null;
    openbare_ruimte_naam?: string;
    postcode?: string;
    woonplaats_naam?: string;
    provincie_naam?: string;
    oppervlakte?: number;
    pand?: { href?: string }[] | string[];
    "pand.href"?: string[];
  };
};

type PandFeature = GeoJsonFeature & {
  properties: {
    identificatie?: string;
    bouwjaar?: number;
  };
};

function pointFromGeometry(geometry: Geometry | undefined) {
  if (geometry?.type === "Point" && Array.isArray(geometry.coordinates)) {
    const [lng, lat] = geometry.coordinates;
    if (typeof lng === "number" && typeof lat === "number") return { lat, lng };
  }
  return undefined;
}

function firstIdFromHref(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const href = value.find((item) => typeof item === "string") as string | undefined;
  if (!href) return undefined;
  return href.split("/").pop()?.split("?")[0];
}

export async function getPropertyByBagId(bagVboId: string): Promise<Property> {
  const vboCollection = await getJson<{ features?: VboFeature[] }>(pdokBagVboSearchUrl(bagVboId), 604_800);
  const vbo = vboCollection.features?.[0];
  if (!vbo) throw new Error(`BAG verblijfsobject ${bagVboId} not found`);

  const props = vbo.properties;
  const relationValues = Array.isArray(props["pand.href"])
    ? props["pand.href"]
    : props.pand;
  const pandIds = Array.isArray(relationValues)
    ? relationValues.flatMap((item) => typeof item === "string" ? [item.split("/").pop()?.split("?")[0]] : [firstIdFromHref(item)])
        .filter((id): id is string => Boolean(id))
    : [];

  const pandFeatures = await Promise.all(
    pandIds.slice(0, 3).map((id) => getJson<PandFeature>(pdokBagFeatureUrl("pand", id), 604_800)),
  );
  const primaryPand = pandFeatures[0];
  const coordinates = pointFromGeometry(vbo.geometry) ?? { lat: 52.1326, lng: 5.2913 };
  const street = props.openbare_ruimte_naam ?? "Onbekende straat";
  const houseNumber = props.huisnummer ?? 0;
  const addressLabel = [street, houseNumber, props.huisletter, props.toevoeging]
    .filter(Boolean)
    .join(" ") + (props.postcode && props.woonplaats_naam ? `, ${props.postcode} ${props.woonplaats_naam}` : "");

  return {
    bagVboId,
    bagPandIds: pandIds,
    addressLabel,
    street,
    houseNumber,
    houseLetter: props.huisletter,
    addition: props.toevoeging,
    postcode: props.postcode ?? "",
    city: props.woonplaats_naam ?? "",
    province: props.provincie_naam,
    coordinates,
    buildingYear: primaryPand?.properties?.bouwjaar,
    areaM2: props.oppervlakte,
    buildingGeometry: primaryPand?.geometry,
  };
}

export async function getPropertyFromAddressHref(href: string): Promise<Property> {
  const address = await getJson<AddressFeature>(href, 604_800);
  const bagVboId = address.properties.adresseerbaar_object_identificatie;
  if (!bagVboId) throw new Error("PDOK address result did not contain a BAG VBO identifier");
  return getPropertyByBagId(bagVboId);
}

export async function getPropertyById(id: string): Promise<Property> {
  if (/^\d{16}$/.test(id)) return getPropertyByBagId(id);
  const address = await getJson<AddressFeature>(pdokBagAddressUrl(id), 604_800);
  const bagVboId = address.properties.adresseerbaar_object_identificatie;
  if (!bagVboId) throw new Error(`PDOK address ${id} did not resolve to a BAG VBO`);
  return getPropertyByBagId(bagVboId);
}
