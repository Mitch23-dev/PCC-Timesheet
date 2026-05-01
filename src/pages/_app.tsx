import type { AppProps } from "next/app";
import "../styles.css";
export default function App({ Component, pageProps }: AppProps) {
    return (
    <>
      <div className="pccBannerWrap">
        <img className="pccBanner" src="/pcc-banner.png" alt="Peter Conrod Construction Ltd" />
        <div className="pccAccentLine" />
      </div>
      <Component {...pageProps} />
    </>
  );

}
