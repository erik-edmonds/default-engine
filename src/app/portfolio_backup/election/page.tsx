"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import "./styles.css";

type Mode = "county" | "state" | "race" | "gender" | "age" | "education";
type AreaMode = "vote" | "electoral" | "vpi";

interface BaseDatum {
  id: string;
  year: number;
  turnout: number;
  vap: number;
  num_dem: number;
  num_rep: number;
}

interface CountyDatum extends BaseDatum {
  county: string;
  state: string;
  county_num: number;
  num_state: number;
  num_state_dem: number;
  num_state_rep: number;
  state_electoral_votes: number;
}

interface StateDatum extends BaseDatum {
  state: string;
  num_state: number;
  state_electoral_votes: number;
}

interface DemographicDatum extends BaseDatum {
  group: string;
  demographic: "race" | "gender" | "age" | "education";
  num_group: number;
}

type Datum = CountyDatum | StateDatum | DemographicDatum;

interface ChartApi {
  rerender: () => void;
  search: (input: string) => void;
  stepYear: (step: number) => void;
}

const margin = { top: 30, right: 20, bottom: 50, left: 50 };

const countyUrl = "/election-data/county_2020.csv";
const stateUrl = "/election-data/state_2020.csv";
const demographicUrl = "/election-data/demographic.csv";

const pctFormat = d3.format(".2%");
const thsdFormat = d3.format(",");

const colorScale = d3
  .scaleLinear<string>()
  .domain([-80, 0, 80])
  .range(["#ef3b2c", "#885ead", "#08519c"])
  .interpolate(d3.interpolateRgb);

function copyObj<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isCounty(d: Datum): d is CountyDatum {
  return "county" in d;
}

function isState(d: Datum): d is StateDatum {
  return "state" in d && !("county" in d);
}

function isDemographic(d: Datum): d is DemographicDatum {
  return "group" in d;
}

function getSearchField(d: Datum, mode: Mode): string {
  if (mode === "county" && isCounty(d)) {
    return d.county;
  }
  if (mode === "state" && isState(d)) {
    return d.state;
  }
  if (isDemographic(d)) {
    return d.group;
  }
  return "";
}

function getTotalVoters(d: Datum, mode: Mode): number {
  if (mode === "county" && isCounty(d)) return d.county_num;
  if (mode === "state" && isState(d)) return d.num_state;
  if (isDemographic(d)) return d.num_group;
  return 0;
}

export default function ElectionPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const plotRef = useRef<SVGGElement>(null);
  const apiRef = useRef<ChartApi | null>(null);
  const cacheRef = useRef<{
    county?: CountyDatum[];
    state?: StateDatum[];
    demographic?: DemographicDatum[];
  }>({});
  const persistedYearRef = useRef<number | null>(null);

  const [mode, setMode] = useState<Mode>("county");
  const [areaMode, setAreaMode] = useState<AreaMode>("vote");
  const [searchInput, setSearchInput] = useState("");

  const demographicMode = useMemo(
    () => mode === "race" || mode === "gender" || mode === "age" || mode === "education",
    [mode],
  );

  useEffect(() => {
    const root = rootRef.current;
    const svg = svgRef.current;
    const plot = plotRef.current;
    if (!root || !svg || !plot) return;

    let cancelled = false;

    const tooltip = root.querySelector<HTMLDivElement>(".election-tooltip");
    if (tooltip) {
      tooltip.style.visibility = "hidden";
    }

    const svgRoot = d3.select(svg);
    const plotRoot = d3.select(plot);
    plotRoot.selectAll("*").remove();

    let width = Math.max(900, window.innerWidth * 0.95 - margin.left - margin.right);
    let height = Math.max(560, window.innerHeight * 0.88 - margin.top - margin.bottom);

    svgRoot.attr("width", width + margin.left + margin.right).attr("height", height + margin.top + margin.bottom);
    plotRoot.attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear().domain([-100, 100]).range([0, width]);
    const yScale = d3.scaleLinear().domain([0, 100]).range([height, 0]);

    const xAxisGroup = plotRoot
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale));

    xAxisGroup
      .append("text")
      .attr("class", "axis-label")
      .attr("y", "3em")
      .attr("x", width / 2)
      .text("Democratic Margin (%)");

    const yAxisGroup = plotRoot.append("g").attr("class", "axis").attr("transform", `translate(${width / 2},0)`).call(d3.axisLeft(yScale));

    yAxisGroup
      .append("text")
      .attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("y", 6)
      .attr("dy", "-3.75em")
      .style("text-anchor", "end")
      .text("Turnout (%VAP)");

    const titleText = plotRoot.append("text").attr("class", "title").attr("dy", height - 10).attr("dx", ".35em");
    const demText = plotRoot.append("text").attr("class", "party").attr("dy", height - 50).attr("dx", 243);
    const repText = plotRoot.append("text").attr("class", "party").attr("dy", height - 14).attr("dx", 243);

    let searchRegex: RegExp | null = null;
    let years: number[] = [];
    let year = persistedYearRef.current ?? 0;
    let modeData: Datum[] = [];
    let datasetByYear = new Map<number, Datum[]>();
    let yearData: Datum[] = [];

    let rScaleVote = d3.scaleLinear().domain([0, 1]).range([1, 35]);
    let rScaleElectoral = d3.scaleLinear().domain([0, 1]).range([1, 35]);
    let rScaleVpi = d3.scaleLinear().domain([0, 1]).range([1, 35]);

    const getActiveAreaMode = (): AreaMode => areaMode;

    function setSearchTerms(input: string) {
      const words = input
        .split(",")
        .map((word) => word.trim())
        .filter(Boolean)
        .map(escapeRegex);

      searchRegex = words.length === 0 ? null : new RegExp(words.join("|"), "i");
    }

    function matchesSearch(d: Datum): boolean {
      if (!searchRegex) return true;
      return searchRegex.test(getSearchField(d, mode));
    }

    function showTooltip(d: Datum) {
      if (!tooltip) return;

      if (mode === "county" && isCounty(d)) {
        tooltip.innerHTML = [
          `${d.county}`,
          `County: D: ${pctFormat(d.num_dem / d.county_num)} R: ${pctFormat(d.num_rep / d.county_num)}`,
          `Turnout: ${pctFormat(d.turnout)}`,
          `Voters: ${thsdFormat(Math.round(d.county_num))}`,
          `State: D: ${pctFormat(d.num_state_dem / d.num_state)} R: ${pctFormat(d.num_state_rep / d.num_state)}`,
        ].join("<br>");
      } else if (mode === "state" && isState(d)) {
        tooltip.innerHTML = [
          `State: ${d.state}`,
          `D: ${pctFormat(d.num_dem / d.num_state)} R: ${pctFormat(d.num_rep / d.num_state)}`,
          `Turnout: ${pctFormat(d.turnout)}`,
          `Voters: ${thsdFormat(Math.round(d.num_state))}`,
        ].join("<br>");
      } else if (isDemographic(d)) {
        const label = d.group.charAt(0).toUpperCase() + d.group.slice(1);
        tooltip.innerHTML = [
          `Group: ${label}`,
          `D: ${pctFormat(d.num_dem / d.num_group)} R: ${pctFormat(d.num_rep / d.num_group)}`,
          `Turnout: ${pctFormat(d.turnout)}`,
          `Voters: ${thsdFormat(Math.round(d.num_group))}`,
        ].join("<br>");
      }

      tooltip.style.visibility = "visible";
    }

    function hideTooltip() {
      if (tooltip) tooltip.style.visibility = "hidden";
    }

    function getRadius(d: Datum): number {
      const activeArea = getActiveAreaMode();
      if (mode === "county" && isCounty(d)) {
        if (activeArea === "electoral") {
          const scaled = Math.sqrt(((d.county_num / d.num_state) * d.state_electoral_votes) / Math.PI);
          return rScaleElectoral(scaled);
        }

        if (activeArea === "vpi") {
          const denominator = Math.max(1, Math.abs(d.num_state_dem - d.num_state_rep));
          const countyVpi = (d.county_num / d.num_state) * (d.state_electoral_votes / denominator);
          return rScaleVpi(Math.sqrt(countyVpi / Math.PI));
        }

        return rScaleVote(Math.sqrt(d.county_num / Math.PI));
      }

      if (mode === "state" && isState(d)) {
        if (activeArea === "electoral") {
          return rScaleElectoral(Math.sqrt(d.state_electoral_votes / Math.PI));
        }

        if (activeArea === "vpi") {
          const denominator = Math.max(1, Math.abs(d.num_dem - d.num_rep));
          return rScaleVpi(Math.sqrt((d.state_electoral_votes / denominator) / Math.PI));
        }

        return rScaleVote(Math.sqrt(d.num_state / Math.PI));
      }

      if (isDemographic(d)) {
        return rScaleVote(Math.sqrt(d.num_group / Math.PI));
      }

      return 2;
    }

    function updateScore(currentData: Datum[]) {
      if (currentData.length === 0) return;

      if (mode === "county") {
        let dem = 0;
        let rep = 0;
        let total = 0;

        for (const d of currentData) {
          if (!isCounty(d)) continue;
          dem += d.num_dem;
          rep += d.num_rep;
          total += d.county_num;
        }

        const uniqueStates = new Map<string, CountyDatum>();
        for (const d of currentData) {
          if (!isCounty(d) || uniqueStates.has(d.state)) continue;
          uniqueStates.set(d.state, d);
        }

        let demElectoral = 0;
        let repElectoral = 0;

        for (const stateDatum of uniqueStates.values()) {
          if (stateDatum.year === 2016 && ["ME", "NE"].includes(stateDatum.state)) {
            demElectoral += 1.5;
            repElectoral += 3;
          } else if (stateDatum.year === 2008 && stateDatum.state === "NE") {
            demElectoral += 1;
            repElectoral += 4;
          } else if (stateDatum.num_state_dem > stateDatum.num_state_rep) {
            demElectoral += stateDatum.state_electoral_votes;
          } else {
            repElectoral += stateDatum.state_electoral_votes;
          }
        }

        demText.text(`D ${pctFormat(dem / total)} ${demElectoral}`);
        repText.text(`R ${pctFormat(rep / total)} ${repElectoral}`);
        demText.style("fill", demElectoral > repElectoral ? "#bbb" : "");
        repText.style("fill", repElectoral >= demElectoral ? "#bbb" : "");
        return;
      }

      if (mode === "state") {
        let dem = 0;
        let rep = 0;
        let total = 0;
        let demElectoral = 0;
        let repElectoral = 0;

        for (const d of currentData) {
          if (!isState(d)) continue;
          dem += d.num_dem;
          rep += d.num_rep;
          total += d.num_state;

          if (d.year === 2016 && ["ME", "NE"].includes(d.state)) {
            demElectoral += 1.5;
            repElectoral += 3;
          } else if (d.year === 2008 && d.state === "NE") {
            demElectoral += 1;
            repElectoral += 4;
          } else if (d.num_dem > d.num_rep) {
            demElectoral += d.state_electoral_votes;
          } else {
            repElectoral += d.state_electoral_votes;
          }
        }

        demText.text(`D ${pctFormat(dem / total)} ${demElectoral}`);
        repText.text(`R ${pctFormat(rep / total)} ${repElectoral}`);
        demText.style("fill", demElectoral > repElectoral ? "#bbb" : "");
        repText.style("fill", repElectoral >= demElectoral ? "#bbb" : "");
        return;
      }

      let dem = 0;
      let rep = 0;
      let total = 0;
      for (const d of currentData) {
        if (!isDemographic(d)) continue;
        dem += d.num_dem;
        rep += d.num_rep;
        total += d.num_group;
      }

      demText.text(`D ${pctFormat(dem / total)}`);
      repText.text(`R ${pctFormat(rep / total)}`);
      demText.style("fill", "");
      repText.style("fill", "");
    }

    function updateScalesForSize() {
      xScale.range([0, width]);
      yScale.range([height, 0]);

      svgRoot.attr("width", width + margin.left + margin.right).attr("height", height + margin.top + margin.bottom);

      xAxisGroup.attr("transform", `translate(0,${height})`).call(d3.axisBottom(xScale));
      xAxisGroup.select(".axis-label").attr("x", width / 2);

      yAxisGroup.attr("transform", `translate(${width / 2},0)`).call(d3.axisLeft(yScale));

      titleText.attr("dy", height - 10);
      demText.attr("dy", height - 50);
      repText.attr("dy", height - 14);
    }

    function renderCurrent(withTransition: boolean) {
      updateScore(yearData);
      titleText.text(String(year));

      const circles = plotRoot.selectAll<SVGCircleElement, Datum>("circle").data(yearData, (d) => d.id);
      circles.exit().remove();

      const dragBehavior = d3
        .drag<SVGCircleElement, Datum>()
        .on("drag", function handleDrag(event, d) {
          if (event.y >= height) return;

          d3.select(this).attr("cx", event.x).attr("cy", event.y);

          const newMargin = xScale.invert(event.x) / 100;
          const newTurnout = Math.max(0, Math.min(1, yScale.invert(event.y) / 100));

          const total = getTotalVoters(d, mode);
          if (total <= 0) return;

          const oldTurnout = d.turnout;
          const oldMargin = (d.num_dem - d.num_rep) / total;
          const marginChange = newMargin - oldMargin;
          const oldDfrac = d.num_dem / total;
          const oldRfrac = d.num_rep / total;

          const dfrac = Math.max(0, Math.min(1, oldDfrac + marginChange / 2));
          const rfrac = Math.max(0, Math.min(1, oldRfrac - marginChange / 2));

          if (mode === "county" && isCounty(d)) {
            const oldNumDem = d.num_dem;
            const oldNumRep = d.num_rep;
            d.county_num = newTurnout * d.vap;
            d.num_dem = dfrac * d.county_num;
            d.num_rep = rfrac * d.county_num;
            d.turnout = newTurnout;

            d.num_state += (newTurnout - oldTurnout) * d.vap;
            d.num_state_dem += d.num_dem - oldNumDem;
            d.num_state_rep += d.num_rep - oldNumRep;

            for (const each of yearData) {
              if (!isCounty(each) || each.state !== d.state) continue;
              each.num_state = d.num_state;
              each.num_state_dem = d.num_state_dem;
              each.num_state_rep = d.num_state_rep;
            }
          } else if (mode === "state" && isState(d)) {
            d.num_state = newTurnout * d.vap;
            d.num_dem = dfrac * d.num_state;
            d.num_rep = rfrac * d.num_state;
            d.turnout = newTurnout;
          } else if (isDemographic(d)) {
            d.num_group = newTurnout * d.vap;
            d.num_dem = dfrac * d.num_group;
            d.num_rep = rfrac * d.num_group;
            d.turnout = newTurnout;
          }

          showTooltip(d);
          updateScore(yearData);
        })
        .on("end", () => {
          renderCurrent(false);
        });

      const entering = circles
        .enter()
        .append("circle")
        .attr("class", "circle")
        .on("mouseover", (_event, d) => showTooltip(d))
        .on("mouseout", hideTooltip)
        .call(dragBehavior);

      const merged = entering.merge(circles as d3.Selection<SVGCircleElement, Datum, SVGGElement, unknown>);

      const applyAttrs = (target: any) => {
        target
          .attr("cx", (d: Datum) => {
            const total = getTotalVoters(d, mode);
            return xScale(((d.num_dem - d.num_rep) / total) * 100);
          })
          .attr("cy", (d: Datum) => yScale(d.turnout * 100))
          .attr("r", (d: Datum) => getRadius(d))
          .attr("fill", (d: Datum) => {
            if (!matchesSearch(d)) {
              return "rgba(192,192,192,0.05)";
            }
            const total = getTotalVoters(d, mode);
            return colorScale(((d.num_dem - d.num_rep) / total) * 100);
          })
          .style("stroke-opacity", (d: Datum) => (matchesSearch(d) ? 1 : 0))
          .style("pointer-events", (d: Datum) => (matchesSearch(d) ? "auto" : "none"));
      };

      if (withTransition) {
        applyAttrs(merged.transition().duration(450));
      } else {
        applyAttrs(merged);
      }
    }

    function stepYear(step: number) {
      if (years.length === 0) return;
      const idx = years.indexOf(year);
      const next = (idx + step + years.length) % years.length;
      year = years[next];
      persistedYearRef.current = year;
      yearData = copyObj(datasetByYear.get(year) ?? []);
      renderCurrent(true);
    }

    function recomputeRadiusDomains(data: Datum[]) {
      if (data.length === 0) return;

      if (mode === "county") {
        const countyData = data.filter(isCounty);
        rScaleVote = d3
          .scaleLinear()
          .domain([0, d3.max(countyData, (d) => Math.sqrt(d.county_num / Math.PI)) ?? 1])
          .range([1, 35]);

        rScaleElectoral = d3
          .scaleLinear()
          .domain([
            0,
            d3.max(countyData, (d) => Math.sqrt(((d.county_num / d.num_state) * d.state_electoral_votes) / Math.PI)) ?? 1,
          ])
          .range([1, 35]);

        rScaleVpi = d3
          .scaleLinear()
          .domain([
            0,
            d3.max(countyData, (d) => {
              const denominator = Math.max(1, Math.abs(d.num_state_dem - d.num_state_rep));
              const countyVpi = (d.county_num / d.num_state) * (d.state_electoral_votes / denominator);
              return Math.sqrt(countyVpi / Math.PI);
            }) ?? 1,
          ])
          .range([1, 35]);
        return;
      }

      if (mode === "state") {
        const stateData = data.filter(isState);
        rScaleVote = d3
          .scaleLinear()
          .domain([0, d3.max(stateData, (d) => Math.sqrt(d.num_state / Math.PI)) ?? 1])
          .range([1, 35]);

        rScaleElectoral = d3
          .scaleLinear()
          .domain([0, d3.max(stateData, (d) => Math.sqrt(d.state_electoral_votes / Math.PI)) ?? 1])
          .range([1, 35]);

        rScaleVpi = d3
          .scaleLinear()
          .domain([
            0,
            d3.max(stateData, (d) => Math.sqrt((d.state_electoral_votes / Math.max(1, Math.abs(d.num_dem - d.num_rep))) / Math.PI)) ??
              1,
          ])
          .range([1, 35]);
        return;
      }

      const demographicData = data.filter(isDemographic);
      rScaleVote = d3
        .scaleLinear()
        .domain([0, d3.max(demographicData, (d) => Math.sqrt(d.num_group / Math.PI)) ?? 1])
        .range([1, 35]);
      rScaleElectoral = rScaleVote;
      rScaleVpi = rScaleVote;
    }

    function initializeDataset(data: Datum[]) {
      modeData = data;
      recomputeRadiusDomains(modeData);
      datasetByYear = d3.group(modeData, (d) => d.year);
      years = Array.from(datasetByYear.keys()).sort((a, b) => a - b);
      year = years.includes(year) ? year : years[0];
      persistedYearRef.current = year;
      yearData = copyObj(datasetByYear.get(year) ?? []);
      setSearchTerms(searchInput);
      renderCurrent(false);
    }

    async function loadCountyData(): Promise<CountyDatum[]> {
      if (cacheRef.current.county) return cacheRef.current.county;

      const rows = await d3.csv(countyUrl, (d) => ({
        county: `${d.county_name}, ${d.state}`,
        state: String(d.state),
        county_num: Number(d.county_num),
        turnout: Number(d.turnout),
        num_rep: Number(d.rep_num),
        num_dem: Number(d.dem_num),
        year: Number(d.year),
        state_electoral_votes: Number(d.state_electoral_votes),
        vap: Number(d.vap),
        id: String(d.fips_code),
        num_state: 0,
        num_state_dem: 0,
        num_state_rep: 0,
      }));

      const stateTotals = d3.rollup(
        rows,
        (values) => ({
          num_state: d3.sum(values, (v) => v.county_num),
          num_state_dem: d3.sum(values, (v) => v.num_dem),
          num_state_rep: d3.sum(values, (v) => v.num_rep),
        }),
        (row) => row.year,
        (row) => row.state,
      );

      for (const row of rows) {
        const totals = stateTotals.get(row.year)?.get(row.state);
        if (!totals) continue;
        row.num_state = totals.num_state;
        row.num_state_dem = totals.num_state_dem;
        row.num_state_rep = totals.num_state_rep;
      }

      cacheRef.current.county = rows;
      return rows;
    }

    async function loadStateData(): Promise<StateDatum[]> {
      if (cacheRef.current.state) return cacheRef.current.state;

      const rows = await d3.csv(stateUrl, (d) => ({
        state: String(d.state),
        id: String(d.state),
        num_state: Number(d.state_num),
        turnout: Number(d.state_num) / Number(d.vap),
        num_rep: Number(d.rep_num),
        num_dem: Number(d.dem_num),
        year: Number(d.year),
        state_electoral_votes: Number(d.state_electoral_votes),
        vap: Number(d.vap),
      }));

      cacheRef.current.state = rows;
      return rows;
    }

    async function loadDemographicData(): Promise<DemographicDatum[]> {
      if (cacheRef.current.demographic) return cacheRef.current.demographic;

      const rows = await d3.csv(demographicUrl, (d) => {
        const electorateFrac = Number(d.electorate_frac);
        const nation = Number(d.num_nation);
        const turnout = Number(d.turnout);
        return {
          group: String(d.group),
          id: `${d.demographic}-${d.group}`,
          num_group: electorateFrac * nation,
          turnout,
          num_rep: Number(d.rep_frac) * electorateFrac * nation,
          num_dem: Number(d.dem_frac) * electorateFrac * nation,
          year: Number(d.year),
          vap: (electorateFrac * nation) / turnout,
          demographic: d.demographic as DemographicDatum["demographic"],
        };
      });

      cacheRef.current.demographic = rows;
      return rows;
    }

    function resize() {
      width = Math.max(900, window.innerWidth * 0.95 - margin.left - margin.right);
      height = Math.max(560, window.innerHeight * 0.88 - margin.top - margin.bottom);
      updateScalesForSize();
      renderCurrent(false);
    }

    async function setup() {
      setSearchTerms(searchInput);

      if (mode === "county") {
        const data = await loadCountyData();
        if (cancelled) return;
        initializeDataset(data);
      } else if (mode === "state") {
        const data = await loadStateData();
        if (cancelled) return;
        initializeDataset(data);
      } else {
        const data = await loadDemographicData();
        if (cancelled) return;
        initializeDataset(data.filter((d) => d.demographic === mode));
      }

      apiRef.current = {
        rerender: () => {
          renderCurrent(true);
        },
        search: (input: string) => {
          setSearchTerms(input);
          renderCurrent(false);
        },
        stepYear: (step: number) => {
          stepYear(step);
        },
      };
    }

    setup();
    window.addEventListener("resize", resize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", resize);
      apiRef.current = null;
      hideTooltip();
    };
  }, [mode]);

  const runSearch = () => {
    apiRef.current?.search(searchInput);
  };

  const resetSearch = () => {
    setSearchInput("");
    apiRef.current?.search("");
  };

  return (
    <main className="election-page" ref={rootRef}>
      <div className="formholder">
        <div className="select-wrap">
          <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
            <option value="county">County</option>
            <option value="state">State</option>
            <option value="race">Race</option>
            <option value="gender">Sex</option>
            <option value="age">Age</option>
            <option value="education">Education</option>
          </select>
        </div>

        <div className="searchform">
          <input
            type="text"
            size={30}
            placeholder="NY, WI, Los Angeles County"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button type="button" onClick={runSearch}>
            Search
          </button>
          <button type="button" onClick={resetSearch}>
            X
          </button>
        </div>

        <fieldset className="areaform">
          <legend>Weight:</legend>
          <label>
            <input
              type="radio"
              name="area"
              value="vote"
              checked={areaMode === "vote"}
              onChange={() => {
                setAreaMode("vote");
                apiRef.current?.rerender();
              }}
            />
            Vote
          </label>
          <label>
            <input
              type="radio"
              name="area"
              value="electoral"
              checked={areaMode === "electoral"}
              onChange={() => {
                setAreaMode("electoral");
                apiRef.current?.rerender();
              }}
              disabled={demographicMode}
            />
            Electoral
          </label>
          <label>
            <input
              type="radio"
              name="area"
              value="vpi"
              checked={areaMode === "vpi"}
              onChange={() => {
                setAreaMode("vpi");
                apiRef.current?.rerender();
              }}
              disabled={demographicMode}
            />
            VPI
          </label>
        </fieldset>

        <div className="election-tooltip" />
      </div>

      <button className="incrbtn upclick" type="button" onClick={() => apiRef.current?.stepYear(1)}>
        ▲
      </button>
      <button className="incrbtn downclick" type="button" onClick={() => apiRef.current?.stepYear(-1)}>
        ▼
      </button>

      <svg ref={svgRef}>
        <g ref={plotRef} />
      </svg>
    </main>
  );
}
