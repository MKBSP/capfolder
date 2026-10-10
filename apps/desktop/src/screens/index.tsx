import { CrumbHeader } from "../components/Header";
import { ComingSoon } from "../components/ui";
import { useApp } from "../state";
import { CreateCompany } from "./CreateCompany";
import { Documents } from "./Documents";
import { Email } from "./Email";
import { Home } from "./Home";
import { Import } from "./Import";
import { NewGrant } from "./NewGrant";
import { NewPerson } from "./NewPerson";
import { NewSafe } from "./NewSafe";
import { NewShares } from "./NewShares";
import { People } from "./People";
import { Person } from "./Person";
import { Pool } from "./Pool";
import { Settings } from "./Settings";
import { Signatures } from "./Signatures";
import { StartChoice } from "./StartChoice";
import { Welcome } from "./Welcome";
import { Wizard } from "./Wizard";

/** Route → screen. */
export function Screen() {
  const { route } = useApp();
  switch (route.name) {
    case "welcome":
      return <Welcome />;
    case "email":
      return <Email />;
    case "create":
      return <CreateCompany />;
    case "start":
      return <StartChoice />;
    case "wizard":
      return <Wizard />;
    case "home":
      return <Home />;
    case "newSafe":
      return <NewSafe />;
    case "newGrant":
      return <NewGrant />;
    case "newShares":
      return <NewShares />;
    case "pool":
      return <Pool />;
    case "newPerson":
      return <NewPerson />;
    case "signatures":
      return <Signatures />;
    case "settings":
      return <Settings />;
    case "import":
      return <Import />;
    case "documents":
      return <Documents />;
    case "people":
      return <People />;
    case "person":
      return <Person id={route.id} />;
    case "comingSoon":
      return (
        <>
          <CrumbHeader title={route.title} />
          <main className="medium">
            <ComingSoon milestone={route.milestone}>{route.text}</ComingSoon>
          </main>
        </>
      );
    default: {
      const unhandled: never = route; // every route has a screen; the compiler checks this
      return unhandled;
    }
  }
}
