import { link, options } from "./Options.module.css";

import { Link, Selector, useTheme } from "@fiftyone/components";
import { CenterFocusWeak, Close, Help } from "@mui/icons-material";
import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import {
  activeField,
  geoFields,
  hasSelection,
  mapStyle,
  STYLES,
} from "./state";
import useEventHandler from "./useEventHandler";
import { useExternalLink } from "@fiftyone/utilities";

const useSearch = (search: string) => {
  const values = STYLES.filter((style) => style.includes(search));

  return { values };
};

const Value: React.FC<{ value: string; className: string }> = ({ value }) => {
  return <>{value}</>;
};

const Options: React.FC<{
  clearSelectionData: () => void;
  fitData: () => void;
  fitSelectionData: () => void;
}> = ({ clearSelectionData, fitSelectionData, fitData }) => {
  const theme = useTheme();
  const [style, setStyle] = useRecoilState(mapStyle);
  const fields = useRecoilValue(geoFields);
  const [field, setActiveField] = useRecoilState(activeField);
  const [selection, setSelection] = useRecoilState(hasSelection);

  const selectorStyle = {
    background: theme.neutral.softBg,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    padding: "0.25rem",
  };
  const reset = React.useCallback(() => {
    clearSelectionData();
    setSelection(false);
    fitData();
  }, [clearSelectionData, fitData, setSelection]);

  useEventHandler(window, "keydown", ({ key }: KeyboardEvent) => {
    switch (key) {
      case "Escape":
        reset();
        break;
      case "f":
        fitSelectionData();
        break;
    }
  });

  return (
    <div className={options}>
      <div>
        <Selector
          placeholder={"Map Style"}
          value={style}
          onSelect={setStyle}
          useSearch={useSearch}
          component={Value}
          containerStyle={selectorStyle}
          overflow={true}
        />
        {fields.length > 1 && (
          <Selector
            placeholder={"Field"}
            value={field}
            onSelect={setActiveField}
            useSearch={() => {
              return { values: fields };
            }}
            component={Value}
            containerStyle={selectorStyle}
            overflow={true}
          />
        )}
      </div>

      <div>
        {selection && (
          <Link to={reset} className={link} title={"Reset (Esc)"}>
            <Close />
          </Link>
        )}

        <Link to={fitSelectionData} className={link} title={"Fit data (f)"}>
          <CenterFocusWeak />
        </Link>

        <Link
          className={link}
          href={"https://voxel51.com/docs/fiftyone/user_guide/app.html#map-tab"}
          title={"Help"}
          to={useExternalLink("https://docs.voxel51.com")}
          target={"_blank"}
        >
          <Help />
        </Link>
      </div>
    </div>
  );
};

export default Options;
