import { motion } from "framer-motion";
import { AFRICAN_CATEGORIES, CategoryKey } from "@/lib/spotify";

interface CategoryCardProps {
  categoryKey: CategoryKey;
  isSelected: boolean;
  onClick: () => void;
}

export const CategoryCard = ({
  categoryKey,
  isSelected,
  onClick,
}: CategoryCardProps) => {
  const category = AFRICAN_CATEGORIES[categoryKey];

  return (
    <motion.button
      onClick={onClick}
      className={`category-card p-4 text-left ${isSelected ? "selected" : ""}`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-center gap-3">
        {/* Emoji icon */}
        <div className="text-3xl">{category.icon}</div>
        
        <div className="flex-1 min-w-0">
          {/* Name */}
          <h4 className="font-display text-sm uppercase tracking-wide truncate">
            {category.name}
          </h4>
          
          {/* Description */}
          <p className="text-xs text-muted-foreground truncate">
            {category.description}
          </p>
        </div>

        {/* Selected indicator */}
        {isSelected && (
          <motion.div
            className="w-6 h-6 rounded-full bg-primary flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
          >
            <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>
        )}
      </div>
    </motion.button>
  );
};
