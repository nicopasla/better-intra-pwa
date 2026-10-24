import FU_SVG_RAW from "../../assets/maps/fu.svg?raw";
import SHI_SVG_RAW from "../../assets/maps/shi.svg?raw";

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

/** The maps carry their own <style>; the app scopes those rules in style.css. */
const stripStyle = (svg: string): string =>
  svg.replace(/<style[^>]*>[\s\S]*?<\/style>/i, "");

const FU_SVG = stripStyle(FU_SVG_RAW);
const SHI_SVG = stripStyle(SHI_SVG_RAW);

function seatIdsFromSvg(svg: string): Set<string> {
  const ids = new Set<string>();
  for (const match of svg.matchAll(/<image\b[^>]*\sid="([^"]+)"/g)) {
    const id = match[1]?.trim();
    if (id) ids.add(id.toLowerCase());
  }
  return ids;
}

/**
 * Cluster names come from campuses/belgium.json. Only SHI and FU have maps for
 * now; the rest are shown as disabled tabs.
 */
export const CLUSTER_MAPS: ClusterMapDef[] = [
  {
    id: "shi",
    label: "SHI",
    imageId: "20",
    available: true,
    svg: SHI_SVG,
    seatIds: seatIdsFromSvg(SHI_SVG),
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
