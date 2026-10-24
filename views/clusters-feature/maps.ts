import FU_SVG_RAW from "../../assets/maps/fu.svg?raw";

export interface ClusterMapDef {
  /** Matches the cluster name in campuses/belgium.json. */
  id: string;
  label: string;
  /** 42 image id behind the SVG map URL. */
  imageId: string;
  available: boolean;
  svg?: string;
  /** Seat hostnames parsed from the map's avatar <image> elements. */
  seatIds: Set<string>;
}

/** The map carries its own <style>; the app scopes those rules in style.css. */
const FU_SVG = FU_SVG_RAW.replace(/<style[^>]*>[\s\S]*?<\/style>/i, "");

function seatIdsFromSvg(svg: string): Set<string> {
  const ids = new Set<string>();
  for (const match of svg.matchAll(/<image\b[^>]*\sid="([^"]+)"/g)) {
    const id = match[1]?.trim();
    if (id) ids.add(id.toLowerCase());
  }
  return ids;
}

/**
 * Cluster names come from campuses/belgium.json. Only FU has a map for now;
 * the rest are shown as disabled tabs.
 */
export const CLUSTER_MAPS: ClusterMapDef[] = [
  {
    id: "shi",
    label: "SHI",
    imageId: "20",
    available: false,
    seatIds: new Set(),
  },
  {
    id: "fu",
    label: "FU",
    imageId: "21",
    available: true,
    svg: FU_SVG,
    seatIds: seatIdsFromSvg(FU_SVG),
  },
  {
    id: "mi",
    label: "MI",
    imageId: "54",
    available: false,
    seatIds: new Set(),
  },
  {
    id: "a2",
    label: "A2",
    imageId: "164",
    available: false,
    seatIds: new Set(),
  },
  {
    id: "a3",
    label: "A3",
    imageId: "165",
    available: false,
    seatIds: new Set(),
  },
];

export function findClusterMap(id: string): ClusterMapDef | undefined {
  return CLUSTER_MAPS.find((map) => map.id === id);
}
