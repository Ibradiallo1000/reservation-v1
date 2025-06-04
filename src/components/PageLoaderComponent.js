import { jsx as _jsx } from "react/jsx-runtime";
const PageLoaderComponent = ({ fullScreen = false }) => {
    return (_jsx("div", { className: `flex items-center justify-center ${fullScreen ? 'fixed inset-0' : 'py-12'}`, children: _jsx("div", { className: "animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" }) }));
};
export default PageLoaderComponent;
