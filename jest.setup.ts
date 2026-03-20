jest.mock("react-native-maps", () => {
  const React = require("react");
  const { View } = require("react-native");

  const MockMapView = React.forwardRef(({ children, ...props }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      animateToRegion: jest.fn(),
    }));

    return React.createElement(View, props, children);
  });

  const Marker = ({ children, ...props }: any) => React.createElement(View, props, children);

  return {
    __esModule: true,
    default: MockMapView,
    Marker,
  };
});

jest.mock("@gorhom/bottom-sheet", () => {
  const React = require("react");
  const { View, ScrollView } = require("react-native");

  const BottomSheet = React.forwardRef(({ children, onChange }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      snapToIndex: (index: number) => {
        onChange?.(index);
      },
    }));

    return React.createElement(View, null, children);
  });

  const BottomSheetScrollView = ({ children, ...props }: any) =>
    React.createElement(ScrollView, props, children);

  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetScrollView,
  };
});

jest.mock("react-native-gesture-handler", () => {
  const actual = jest.requireActual("react-native-gesture-handler/jestSetup");
  const React = require("react");
  const { View } = require("react-native");

  return {
    ...actual,
    GestureHandlerRootView: ({ children }: any) =>
      React.createElement(View, { style: { flex: 1 } }, children),
  };
});
