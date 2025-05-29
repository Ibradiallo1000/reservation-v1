import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const VideoBanner = ({ videoUrl, fallbackImage, children }) => {
    return (_jsxs("div", { className: "relative h-[420px] w-full overflow-hidden", children: [_jsx("video", { className: "absolute inset-0 w-full h-full object-cover", src: videoUrl, autoPlay: true, muted: true, loop: true, playsInline: true, poster: fallbackImage }), _jsx("div", { className: "absolute inset-0 bg-black bg-opacity-50 flex flex-col justify-center items-center text-white text-center px-4", children: children })] }));
};
export default VideoBanner;
