import dogeGameLabImage from "@/assets/dogegamelab-project.webp";
import dogeosIcon from "@/assets/dogeos-icon.png";
import { cn } from "@/lib/utils";

/** The DogeGameLab project image: our headphone-wearing Doge with a controller. */
export function DogeIcon({
  size = 40,
  className = "",
  bob = false,
  fill = false,
  title,
}: {
  size?: number;
  /** Stretch to fill the parent box (ignores `size`). */
  fill?: boolean;
  className?: string;
  /** Gentle idle bounce, like the old pixel mascot. */
  bob?: boolean;
  title?: string;
}) {
  return (
    <img
      src={dogeGameLabImage}
      width={fill ? undefined : size}
      height={fill ? undefined : size}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      draggable={false}
      className={cn(
        "shrink-0 select-none",
        fill && "h-full w-full object-cover",
        bob && "animate-bob",
        className,
      )}
      style={fill ? undefined : { width: size, height: size }}
    />
  );
}

/** The DOGEOS block wordmark. Uses currentColor so it follows the theme. */
export function DogeOSWordmark({
  height = 12,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 51.4521 10.6592"
      height={height}
      width={(height * 51.4521) / 10.6592}
      fill="currentColor"
      role="img"
      aria-label="DogeOS"
      className={cn("shrink-0", className)}
    >
      <path d="M33.6279 1.52539H28.2373V4.56934H32.0859V6.09277H28.2373V9.13574H33.6279V10.6592H28.2373V10.6543L26.6953 9.13086V1.52539L28.2373 0H33.6279V1.52539ZM7.7002 1.52539V9.13477L6.1582 10.6582H0V0H6.1582L7.7002 1.52539ZM16.5918 1.52539V9.13477L15.0508 10.6582H10.4307V10.6543L8.88867 9.13086V1.52539L10.4307 0H15.0508L16.5918 1.52539ZM51.4521 1.72461V3.07715H49.3564V2.07715H45.8486V4.29395H49.7119L51.4521 6.0127V8.93848L49.7119 10.6582H45.4912L43.75 8.93848V7.58594H45.8486V8.58203H49.3564V6.36621H45.4912L43.75 4.64746V1.72461L45.4932 0H49.7119L51.4521 1.72461ZM42.5312 1.72461V8.9375L40.792 10.6562H36.5674L34.8281 8.9375V1.72461L36.5674 0H40.7939L42.5312 1.72461ZM25.498 1.52539V3.04883H23.957V1.52539H19.3369V9.13477H23.957V6.08887H22.415V4.56543H25.4951V9.13086L23.9531 10.6543H19.3369L17.7949 9.13086V1.52539L19.3369 0H23.957L25.498 1.52539ZM1.54199 9.13477H6.16211L6.1582 9.13086V1.52539H1.54199V9.13477ZM10.4307 9.13477H15.0508V1.52539H10.4307V9.13477ZM36.9248 8.58203H40.4346V2.07715H36.9248V8.58203Z" />
    </svg>
  );
}

/** The official DogeOS app icon, for "Built on DogeOS" branding only. */
export function DogeOSIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={dogeosIcon}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("shrink-0 select-none", className)}
      style={{ width: size, height: size }}
    />
  );
}
