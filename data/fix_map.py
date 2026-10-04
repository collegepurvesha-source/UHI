import pandas as pd
import geopandas as gpd
import os

print("Loading data...")
df = pd.read_csv('Bengaluru_ward_heat_diagnosis_2026.csv')
gdf = gpd.read_file('Bengaluru_wards_LST_NDVI_NDBI_NDWI_2026_04_25.geojson')

# Find the overlapping ID column automatically (e.g., WARD_NAME, WARD_NO)
id_cols = [c for c in df.columns if c in gdf.columns and c not in ['LST_mean_C', 'NDVI_mean', 'NDBI_mean', 'NDWI_mean', 'valid_pixels']]

if not id_cols:
    print("Error: Could not find a matching column between the CSV and GeoJSON.")
else:
    merge_col = id_cols[0]
    print(f"Merging map and data using column: {merge_col}")
    
    # New diagnosis columns to add to the map
    new_cols = ['diagnostic_class', 'primary_driver', 'secondary_driver', 'evidence_confidence', 'recommended_audit', 'intervention_package', 'expected_benefit_type', 'limitations', 'lst_anomaly_C', 'built_up_risk', 'vegetation_deficit', 'wetness_signal', 'heat_class', 'priority_score']
    
    cols_to_merge = [c for c in new_cols if c in df.columns] + [merge_col]
    gdf_out = gdf.merge(df[cols_to_merge], on=merge_col, how='left')
    
    # Save to a temp file first, then safely overwrite the original
    if os.path.exists('temp.geojson'):
        os.remove('temp.geojson')
        
    gdf_out.to_file('temp.geojson', driver='GeoJSON')
    
    original_file = 'Bengaluru_wards_LST_NDVI_NDBI_NDWI_2026_04_25.geojson'
    os.replace('temp.geojson', original_file)
    
    print("Success! Your original map file now contains all the diagnosis data.")