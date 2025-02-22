import * as foq from "@fiftyone/relay";
import { VALID_KEYPOINTS } from "@fiftyone/utilities";
import { VariablesOf } from "react-relay";
import { GetRecoilValue, selectorFamily } from "recoil";
import { graphQLSelectorFamily } from "recoil-relay";

import * as filterAtoms from "./filters";
import { ResponseFrom } from "../utils";
import { groupStatistics, groupId, currentSlice } from "./groups";
import { RelayEnvironmentKey } from "./relay";
import * as selectors from "./selectors";
import * as schemaAtoms from "./schema";
import * as viewAtoms from "./view";
import { sidebarSampleId } from "./modal";
import { refresher } from "./atoms";
import { field } from "./schema";

/**
 * GraphQL Selector Family for Aggregations.
 * @param extended - Whether to use extended aggregations.
 */
export const aggregationQuery = graphQLSelectorFamily<
  VariablesOf<foq.aggregationsQuery>,
  { extended: boolean; modal: boolean; paths: string[]; root?: boolean },
  ResponseFrom<foq.aggregationsQuery>
>({
  key: "aggregationQuery",
  environment: RelayEnvironmentKey,
  mapResponse: (response) => response,
  query: foq.aggregation,
  variables:
    ({ extended, modal, paths, root = false }) =>
    ({ get }) => {
      const mixed = get(groupStatistics(modal)) === "group";
      //TODO: refactor to reuse viewStateForm here?
      const aggForm = {
        index: get(refresher),
        dataset: get(selectors.datasetName),
        extendedStages: root ? [] : get(selectors.extendedStagesUnsorted),
        filters:
          extended && !root
            ? get(modal ? filterAtoms.modalFilters : filterAtoms.filters)
            : null,
        groupId: !root && modal && mixed ? get(groupId) : null,
        hiddenLabels: !root ? get(selectors.hiddenLabelsArray) : [],
        paths,
        mixed,
        sampleIds: !root && modal && !mixed ? [get(sidebarSampleId)] : [],
        slice: get(currentSlice(modal)),
        view: !root ? get(viewAtoms.view) : [],
      };

      return {
        form: aggForm,
      };
    },
});

export const aggregations = selectorFamily({
  key: "aggregations",
  get:
    (params: { extended: boolean; modal: boolean; paths: string[] }) =>
    ({ get }) => {
      if (params) {
        let extended = params.extended;
        if (extended && !get(filterAtoms.hasFilters(params.modal))) {
          extended = false;
        }

        return get(aggregationQuery({ ...params, extended })).aggregations;
      }
      return [];
    },
});

export const aggregation = selectorFamily({
  key: "aggregation",
  get:
    ({
      path,
      ...params
    }: {
      extended: boolean;
      modal: boolean;
      path: string;
    }) =>
    ({ get }) => {
      const result = get(
        aggregations({ ...params, paths: get(schemaAtoms.filterFields(path)) })
      ).filter((data) => data.path === path);
      // Avoid downstream errors due to undefined.map by returning an
      // object for failed graphQL aggregations
      return result?.length
        ? result[0]
        : {
            path: path,
            count: 0,
            exists: 0,
            values: [],
          };
    },
});

export const noneCount = selectorFamily<
  number,
  { path: string; modal: boolean; extended: boolean }
>({
  key: "noneCount",
  get:
    (params) =>
    ({ get }) => {
      const data = get(aggregation(params));
      const parent = params.path.split(".").slice(0, -1).join(".");

      // for ListField, set noneCount to zero (so that it is the none option is omitted in display)
      const schema = get(field(params.path));
      const isListField = schema.ftype.includes("ListField");
      return isListField
        ? 0
        : (get(count({ ...params, path: parent })) as number) - data.count;
    },
});

export const labelTagCounts = selectorFamily<
  { [key: string]: number },
  { modal: boolean; extended: boolean }
>({
  key: "labelTagCounts",
  get:
    ({ modal, extended }) =>
    ({ get }) => {
      const data = get(schemaAtoms.labelPaths({})).map((path) =>
        get(aggregation({ extended, modal, path: `${path}.tags` }))
      );
      const result = {};

      for (let i = 0; i < data.length; i++) {
        const { values } = data[i];
        for (let j = 0; j < values.length; j++) {
          const { value, count } = values[j];
          if (!result[value]) {
            result[value] = 0;
          }

          result[value] += count;
        }
      }

      return result;
    },
});

export const sampleTagCounts = selectorFamily<
  { [key: string]: number },
  { modal: boolean; extended: boolean }
>({
  key: "sampleTagCounts",
  get:
    (params) =>
    ({ get }) =>
      Object.fromEntries(
        get(aggregation({ ...params, path: "tags" })).values.map(
          ({ value, count }) => [value, count]
        )
      ),
});

export const stringCountResults = selectorFamily({
  key: "stringCountResults",
  get:
    (params: { path: string; modal: boolean; extended: boolean }) =>
    ({ get }): { count: number; results: [string | null, number][] } => {
      const keys = params.path.split(".");
      let parent = keys[0];
      let field = get(schemaAtoms.field(parent));
      if (!field && parent === "frames") {
        parent = `frames.${keys[1]}`;
      }

      if (
        VALID_KEYPOINTS.includes(get(schemaAtoms.field(parent)).embeddedDocType)
      ) {
        const skeleton = get(selectors.skeleton(parent));

        return {
          count: skeleton.labels.length,
          results: skeleton.labels.map((label) => [label as string | null, -1]),
        };
      }

      let { values, count } = get(aggregation(params));

      const results: [string | null, number][] = values.map(
        ({ count, value }) => [value, count]
      );
      const none: number = get(noneCount(params));

      if (none) {
        results.push([null, none]);
        count++;
      }

      return {
        count,
        results,
      };
    },
});

export const booleanCountResults = selectorFamily<
  { count: number; results: [boolean | null, number][] },
  { path: string; modal: boolean; extended: boolean }
>({
  key: "booleanCountResults",
  get:
    (params) =>
    ({ get }) => {
      const data = get(aggregation(params));
      const none = get(noneCount(params));
      const result = {
        count: data.false + data.true,
        results: [
          [false, data.false],
          [true, data.true],
        ],
      };
      if (none) {
        result.results.push([null, none]);
      }
      return result;
    },
});

export const labelCount = selectorFamily<
  number | null,
  { modal: boolean; extended: boolean }
>({
  key: "labelCount",
  get:
    (params) =>
    ({ get }) => {
      let sum = 0;

      for (const path of get(
        schemaAtoms.activeLabelPaths({ modal: params.modal })
      )) {
        const data = get(aggregation({ ...params, path }));
        sum += data.count;
      }

      return sum;
    },
});

export const values = selectorFamily<
  string[],
  { extended: boolean; path: string; modal: boolean }
>({
  key: "values",
  get:
    (params) =>
    ({ get }) => {
      if (params) {
        const result = get(aggregation(params));
        if (result && result.values) {
          return result.values.map(({ value }) => value).sort() || [];
        }
      }
      return [];
    },
});

export const count = selectorFamily({
  key: "count",
  get:
    ({
      value,
      ...params
    }: {
      extended: boolean;
      path: string;
      modal: boolean;
      value?: string | null;
    }) =>
    ({ get }): number => {
      if (params.path === "_") {
        return get(aggregation({ ...params, path: "" })).slice;
      }

      const exists =
        Boolean(get(schemaAtoms.field(params.path))) || !params.path;

      if (!exists) {
        const split = params.path.split(".");

        if (split[0] === "tags") {
          return get(counts({ ...params, path: "tags" }))[
            split.slice(1).join(".")
          ];
        }

        if (split.length < 2) {
          // this will never resolve, which allows for incoming schema changes
          // this shouldn't be necessary, but there is a mismatch between
          // aggs and schema when there is a field change
          throw new Promise(() => {});
        }

        const parent = split.slice(0, split.length - 1).join(".");

        return get(counts({ ...params, path: parent }))[
          split[split.length - 1]
        ];
      }

      if (value === null) {
        return get(noneCount(params));
      }

      if (value !== undefined) {
        return get(counts(params))[value] || 0;
      }

      return get(aggregation(params))?.count as number;
    },
});

export const counts = selectorFamily({
  key: "counts",
  get:
    (params: { extended: boolean; path: string; modal: boolean }) =>
    ({ get }): { [key: string]: number } => {
      const exists = Boolean(get(schemaAtoms.field(params.path)));

      if (!exists) {
        const parent = params.path.split(".")[0];

        if (
          VALID_KEYPOINTS.includes(
            get(schemaAtoms.field(parent)).embeddedDocType
          )
        ) {
          const skeleton = get(selectors.skeleton(parent));

          return skeleton.labels.reduce((acc, cur) => {
            acc[cur] = -1;
            return acc;
          }, {});
        }
      }

      const data = get(aggregation(params));

      if (data.values) {
        return Object.fromEntries(
          data.values.map(({ count, value }) => [value, count])
        );
      }

      return Object.fromEntries(get(booleanCountResults(params)).results);
    },
});

const gatherPaths = (
  get: GetRecoilValue,
  ftype: string | string[],
  embeddedDocType?: string | string[]
) => {
  const paths = [];

  const recurseFields = (path) => {
    const field = get(schemaAtoms.field(path));

    if (get(schemaAtoms.meetsType({ path, ftype, embeddedDocType }))) {
      paths.push(path);
    }
    if (field.fields) {
      Object.keys(field.fields).forEach((name) =>
        recurseFields(`${path}.${name}`)
      );
    }
  };

  const schema = get(schemaAtoms.fieldPaths({}));
  for (const path of schema) recurseFields(path);
  return paths;
};

export const cumulativeCounts = selectorFamily<
  { [key: string]: number },
  {
    extended: boolean;
    path: string;
    modal: boolean;
    ftype: string | string[];
    embeddedDocType?: string | string[];
  }
>({
  key: "cumulativeCounts",
  get:
    ({ extended, path: key, modal, ftype, embeddedDocType }) =>
    ({ get }) => {
      return gatherPaths(get, ftype, embeddedDocType).reduce((result, path) => {
        const data = get(counts({ extended, modal, path: `${path}.${key}` }));
        for (const value in data) {
          if (!result[value]) {
            result[value] = 0;
          }

          result[value] += data[value];
        }
        return result;
      }, {});
    },
});

export const cumulativeValues = selectorFamily<
  string[],
  {
    extended: boolean;
    path: string;
    modal: boolean;
    ftype: string | string[];
    embeddedDocType?: string | string[];
  }
>({
  key: "cumulativeValues",
  get:
    ({ extended, path: key, modal, ftype, embeddedDocType }) =>
    ({ get }) => {
      return Array.from(
        new Set<string>(
          gatherPaths(get, ftype, embeddedDocType).reduce(
            (result, path) => [
              ...result,
              ...get(values({ extended, modal, path: `${path}.${key}` })),
            ],
            []
          )
        )
      ).sort();
    },
});

export const bounds = selectorFamily({
  key: "bounds",
  get:
    (params: { extended: boolean; path: string; modal: boolean }) =>
    ({ get }) => {
      const { min, max } = get(aggregation(params));

      return [min, max] as [number, number];
    },
});

export const nonfiniteCounts = selectorFamily({
  key: "nonfiniteCounts",
  get:
    (params: { extended: boolean; path: string; modal: boolean }) =>
    ({ get }) => {
      const { inf, nan, ninf, exists } = get(aggregation(params));

      const { count: parentCount } = get(
        aggregation({
          ...params,
          path: params.path.split(".").slice(0, -1).join("."),
        })
      );
      return {
        inf: inf === undefined ? 0 : inf,
        nan: nan === undefined ? 0 : nan,
        ninf: ninf === undefined ? 0 : ninf,
        none: parentCount - exists,
      };
    },
});

/**
 * @hidden
 */
export type Nonfinite = "nan" | "ninf" | "inf" | "none";

export const nonfiniteCount = selectorFamily<
  number,
  { extended: boolean; path: string; modal: boolean; key: Nonfinite }
>({
  key: "nonfiniteCount",
  get:
    ({ key, ...params }) =>
    ({ get }) =>
      get(nonfiniteCounts(params))[key],
});

export const boundedCount = selectorFamily<
  number,
  { extended: boolean; path: string; modal: boolean }
>({
  key: "boundedCount",
  get:
    (params) =>
    ({ get }) => {
      const nonfinites = Object.entries(get(nonfiniteCounts(params))).reduce(
        (sum, [key, count]) => (key === "none" ? sum : sum + (count || 0)),
        0
      );

      return get(count(params)) - nonfinites;
    },
});
