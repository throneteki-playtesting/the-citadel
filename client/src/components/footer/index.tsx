import { Link } from "@heroui/react";
import { Link as RouterLink } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";

const Footer = () => {
    return (
        <footer className="mt-8 border-t border-default-200 py-8">
            <div className="mx-auto max-w-5xl px-3 grid grid-cols-1 sm:grid-cols-3 gap-8 text-small font-cinzel justify-items-center">
                <div>
                    <p className="font-semibold text-default-600 mb-3">Resources</p>
                    <ul className="space-y-2">
                        <li>
                            <Link href="https://www.theironthrone.net" isExternal color="foreground" className="text-default-500 text-small">
                                The Iron Throne
                            </Link>
                        </li>
                        <li>
                            <Link href="https://thronesdb.com" isExternal color="foreground" className="text-default-500 text-small">
                                ThronesDB
                            </Link>
                        </li>
                        <li>
                            <Link href="https://agot.cards" isExternal color="foreground" className="text-default-500 text-small">
                                AGOT Cards
                            </Link>
                        </li>
                    </ul>
                </div>
                <div>
                    <p className="font-semibold text-default-600 mb-3">Community</p>
                    <ul className="space-y-2">
                        <li>
                            <Link href="https://discord.gg/pJHTyzgHJv" isExternal color="foreground" className="text-default-500 text-small gap-1.5">
                                <FontAwesomeIcon icon={faDiscord} /> Design & Playtesting
                            </Link>
                        </li>
                        <li>
                            <Link href="https://discord.gg/H3NrebVzUn" isExternal color="foreground" className="text-default-500 text-small gap-1.5">
                                <FontAwesomeIcon icon={faDiscord} /> GOT
                            </Link>
                        </li>
                    </ul>
                </div>
                <div>
                    <p className="font-semibold text-default-600 mb-3">Legal</p>
                    <ul className="space-y-2">
                        <li>
                            <Link as={RouterLink} to="/privacy" color="foreground" className="text-default-500 text-small">
                                Privacy Policy
                            </Link>
                        </li>
                    </ul>
                </div>
            </div>
            <div className="mt-8 text-center text-tiny text-default-400 font-cinzel">
                The Citadel — A Game of Thrones LCG Playtesting Tool
            </div>
        </footer>
    );
};

export default Footer;
