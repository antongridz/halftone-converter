# HalftonePress

A powerful, browser-based halftone converter application built with Next.js and WebGL.

![HalftonePress UI](https://github.com/antongridz/halftone-converter/raw/main/public/preview.png)

## Features

-   **High-Performance Rendering**: GPU-accelerated halftone generation using WebGL.
-   **Multiple Patterns**: Circle, Square, Diamond, Ellipse, Lines, Cross, Star, Triangle, Hex, Ring, Wave, Dot Grid.
-   **Color Modes**:
    -   **CMYK**: Full 4-channel separation with adjustable angles and frequencies.
    -   **Mono**: Classic black and white halftone.
    -   **Duotone/Tritone**: Custom color mapping.
-   **Presets**: 12 curated presets including Newspaper, Risograph, Comic, Pop Art, and more.
-   **Export Options**:
    -   **PNG**: High-resolution raster export with optional transparent background.
    -   **SVG**: True vector output for CMYK and Mono modes.
    -   **PDF**: Print-ready PDF generation.
-   **Interactive UI**:
    -   Real-time preview with zoom controls.
    -   Split-screen comparison slider.
    -   Collapsible sidebar sections.
    -   Drag & drop image upload.

## Tech Stack

-   **Framework**: [Next.js 14+](https://nextjs.org/) (App Router)
-   **UI Library**: React
-   **Graphics**: WebGL (custom engine)
-   **Styling**: CSS Modules / Global CSS
-   **PDF Generation**: `jspdf`

## Getting Started

1.  Clone the repository:
    ```bash
    git clone https://github.com/antongridz/halftone-converter.git
    cd halftone-converter
    ```

2.  Install dependencies:
    ```bash
    npm install
    # or
    yarn install
    ```

3.  Run the development server:
    ```bash
    npm run dev
    ```

4.  Open [http://localhost:3000](http://localhost:3000) with your browser.

## License

MIT



